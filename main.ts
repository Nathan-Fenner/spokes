
import {HexPos, HexMap, generateMap} from './generation'

import {clamp, randomChoose, median, range, distinct, middle} from './utility'

import {Vec2, Vec3, Mat4, add, scale, subtract, multiply, magnitude, unit, cross} from './matrix'

import {Glacier, getGlacialTexture} from './glacial';

let canvas = document.getElementById("canvas") as HTMLCanvasElement;
canvas.width = 600;
canvas.height = 600;

// build a hex grid

// generation parameters (TODO: expose this in the UI)

export type WorldPos = {wx: number, wy: number};

function hexToWorld(pos: {hx: number, hy: number}) {
    let {hx, hy} = pos;
    return {wx: hx + hy*Math.cos(Math.PI*2/3), wy: hy * Math.sin(Math.PI*2/3)};
}

function hexCorners(p: HexPos): WorldPos[] {
    let ns = p.neighbors();
    let rs: WorldPos[] = [];
    for (let i = 0; i < 6; i++) {
        let {wx: cx, wy: cy} = hexToWorld(p);
        let {wx: ax, wy: ay} = hexToWorld(ns[i]);
        let {wx: bx, wy: by} = hexToWorld(ns[(i+1)%6]);
        rs[i] = {wx: (ax+bx+cx)/3, wy: (ay+by+cy)/3};
    }
    return rs;
}

// world generation

// the goal of the game's design is to make a 4X game where rapidly expanding in the early game is a bad strategy.
// in particular, long-term harmony with your neighbors should be your best strategy.

// nations are mostly separate (even under the same empire), to simplify gameplay and design


// This is a literate docment that gives an overview of WebGL in TypeScript.
// Why TypeScript? Because I like TypeScript, and if you're using it,
// you definitely have access to modern (i.e. ES2016) features via transpiling.

// We assume that there's a canvas called 'c' in the document.

let tryGL = canvas.getContext("webgl");

if (!tryGL) {
    throw "unable to get webGL context";
}

let gl = tryGL;


let specification = {
    uniforms: {
        perspective: Glacier.mat4,
        cameraPosition: Glacier.mat4,
        camera: Glacier.mat4,
        lightDirection: Glacier.vec3,
        shadowMap: Glacier.image,
        shadowPerspective: Glacier.mat4,
        shadowCamera: Glacier.mat4,
        shadowCameraPosition: Glacier.mat4,
        shadowScale: Glacier.float,
        shadowSource: Glacier.vec3,
    },
    attributes: {
        vertexPosition: Glacier.vec3,
        vertexColor: Glacier.vec3,
        vertexNormal: Glacier.vec3,
        vertexBanding: Glacier.float,
    },
};

export let glacier = new Glacier<typeof specification, "screen">({
    vertexShader: `
    precision mediump float;
    uniform mat4 perspective;
    uniform mat4 cameraPosition;
    uniform mat4 camera;

    attribute vec3 vertexPosition;
    attribute vec3 vertexColor;
    attribute vec3 vertexNormal;
    attribute float vertexBanding;

    varying vec3 fragmentPosition;
    varying vec3 fragmentColor;
    varying vec3 fragmentNormal;
    varying float fragmentBanding;

    void main(void) {
        gl_Position = perspective * camera * cameraPosition * vec4(vertexPosition, 1.0);
        fragmentPosition = vertexPosition;
        fragmentColor = vertexColor;
        fragmentNormal = vertexNormal;
        fragmentBanding = vertexBanding;
    }

    `,
    fragmentShader: `
    precision mediump float;
    uniform vec3 lightDirection;
    uniform sampler2D shadowMap;

    uniform mat4 shadowPerspective;
    uniform mat4 shadowCamera;
    uniform mat4 shadowCameraPosition;
    uniform float shadowScale;
    uniform vec3 shadowSource;

    varying vec3 fragmentPosition;
    varying vec3 fragmentColor;
    varying vec3 fragmentNormal;
    varying float fragmentBanding;
    
    uniform mat4 cameraPosition;
    
    void main(void) {
        vec3 eye = -(cameraPosition * vec4(0.0, 0.0, 0.0, 1.0)).xyz;
        vec3 eyeDir = normalize(eye - fragmentPosition);
        if (dot(eyeDir, fragmentNormal) > 0.0) {
            discard;
        }

        float y = min(1.0, max(0.0, 0.6 - fragmentPosition.y * 0.2));
        float lambert = -dot(normalize(fragmentNormal), normalize(lightDirection)) * 0.35 + 0.65;
        gl_FragColor = vec4(lambert * y * fragmentColor, 1.0);
        float originalHeight = fragmentPosition.y * -4.0;
        if (fragmentBanding > 0.91) {
            gl_FragColor.rgb *= 0.96;
        }
        if (fragmentBanding > 0.95) {
            gl_FragColor.rgb *= 0.95;
        }

        // shadows below

        if (dot(fragmentNormal, lightDirection) > 0.0) {
            // check before shadow map lookup
            gl_FragColor.rgb *= 0.5; // shadowed
        } else {
            vec4 projected = shadowPerspective * shadowCamera * shadowCameraPosition * vec4(fragmentPosition, 1.0);
            vec2 screen = projected.xy / projected.w;
            if (abs(screen.x) < 1.0 && abs(screen.y) < 1.0) {
                // only place shadows on things within the shadowmap's view
                float shadowDistance = texture2D(shadowMap, screen*0.5 + 0.5).r;
                float realDistance = max(0.0, min(1.0, distance(fragmentPosition, shadowSource) / shadowScale * 2.0 - 1.0));
                if (realDistance > shadowDistance + 0.01) {
                    gl_FragColor.rgb *= 0.5; // shadowed
                }
            }
        }
    }
    `,
    specification,
    context: gl,
    target: "screen",
});

let shadowSpecification = {
    uniforms: {
        perspective: Glacier.mat4,
        camera: Glacier.mat4,
        cameraPosition: Glacier.mat4,
        shadowSource: Glacier.vec3,
        shadowScale: Glacier.float,
    },
    attributes: {
        vertexPosition: Glacier.vec3,
    },
};

export let shadowGlacier = new Glacier<typeof shadowSpecification, "texture">({
    vertexShader: `
    precision mediump float;
    uniform mat4 perspective;
    uniform mat4 cameraPosition;
    uniform mat4 camera;

    attribute vec3 vertexPosition;
    varying vec3 fragmentPosition;

    void main(void) {
        gl_Position = perspective * camera * cameraPosition * vec4(vertexPosition, 1.0);
        fragmentPosition = vertexPosition;
    }
    `,
    fragmentShader: `
    precision mediump float;

    varying vec3 fragmentPosition;

    uniform vec3 shadowSource;
    uniform float shadowScale;

    void main(void) {
        gl_FragColor = vec4(max(0.0, min(0.99, distance(fragmentPosition, shadowSource) / shadowScale * 2.0 - 1.0)) * vec3(1.0, 1.0, 1.0), 1.0);
    }
    `,
    specification: shadowSpecification,
    context: gl,
    target: "texture",
});

let lightDirection: Vec3 = unit([2, -4, 2]);

// Now, let's create the vertices for our triangle, and send them to the GPU.

function cornerHeightCombine(self: number, hs: number[]): number {
    if (range([self, ...hs]) == 1) {
        return median([self, ...hs]);
    }
    if (hs.length == 2 && range([self, ...hs]) == 2 && distinct([self, ...hs])) {
        return middle([self, ...hs]);
    }
    if (hs.length == 2 && hs.filter((x) => Math.abs(x - self) <= 1).length == 2) {
        return middle([self, ...hs]);
    }
    if (hs.length == 2) {
        let nearby = hs.filter((x) => Math.abs(x - self) <= 1);
        return cornerHeightCombine(self, nearby);
    }
    return self;
}

let world = generateMap();

// TODO: hierarchical meshes?
// let worldMesh = new Mesh({vertexColor: "vec3"}, "vertexPosition", "vertexNormal");

type MeshVertex = {
    vertexPosition: Vec3,
    vertexNormal: Vec3,
    vertexColor: Vec3,
    vertexBanding: number,
};

let meshTriangles: [MeshVertex, MeshVertex, MeshVertex][] = [];

function triangleNormal(a: Vec3, b: Vec3, c: Vec3): Vec3 {
    return unit(cross(subtract(b, a), subtract(c, a)));
}

function addTriangle(va: Vec3, vb: Vec3, vc: Vec3, attributes: {vertexColor: Vec3, vertexBanding?: number}, group?: string) {
    let banding = attributes.vertexBanding || 0;
    let normal = triangleNormal(va, vb, vc);
    meshTriangles.push([
        {vertexPosition: va, vertexNormal: normal, vertexColor: attributes.vertexColor, vertexBanding: banding},
        {vertexPosition: vb, vertexNormal: normal, vertexColor: attributes.vertexColor, vertexBanding: 0},
        {vertexPosition: vc, vertexNormal: normal, vertexColor: attributes.vertexColor, vertexBanding: banding}
    ]);
}

for (let p of world.heightMap.cells()) {
    let cs = hexCorners(p);
    let bladeCount = 30 * randomChoose([0, 0, 0, 1, 1/8, 1/8, 1/20]);
    let corners: {point: WorldPos, height: number}[] = [];
    let neighbors = p.neighbors();
    for (let i = 0; i < 6; i++) {
        let n1 = neighbors[i];
        let n2 = neighbors[(i+1)%6];
        let pos1 = hexToWorld(p);
        let pos2 = hexToWorld(n1);
        let pos3 = hexToWorld(n2);
        let point = {wx: (pos1.wx + pos2.wx + pos3.wx)/3, wy: (pos1.wy + pos2.wy + pos3.wy)/3};
        let hs: number[] = [];
        if (world.heightMap.contains(n1)) {
            hs.push(world.heightMap.get(n1));
        }
        if (world.heightMap.contains(n2)) {
            hs.push(world.heightMap.get(n2));
        }
        let height = cornerHeightCombine(world.heightMap.get(p), hs);
        corners.push({point, height});
    }

    let bladeChance = 1/300;
    if (Math.random() < 1/30) {
        bladeChance = 0.7;
    }

    for (let i = 0; i < 6; i++) {
        let {wx, wy} = hexToWorld(p);
        let {wx: ax, wy: ay} = corners[i].point; // cs[i];
        let {wx: bx, wy: by} = corners[(i+1)%6].point;

        let reheight = (h: number) => -h * 0.25;

        let mainHeight = reheight(world.heightMap.get(p));
        let cornerAHeight = reheight(corners[i].height);
        let cornerBHeight = reheight(corners[(i+1)%6].height);

        let hexColor: Vec3 = [0.4, 0.6, 0.25];
        // dirt: [0.9, 0.65, 0.35];
        hexColor = hexColor.map((x) => x * (world.heightMap.get(p) * 0.04 + 0.8));

        addTriangle([ax, cornerAHeight, ay], [wx, mainHeight, wy], [bx, cornerBHeight, by], {vertexColor: hexColor, vertexBanding: 1}, "surface");

        let sideShadow = 0.4;
        let grassColor: Vec3 = hexColor; //  [0.3, 0.4, 0.2]
        grassColor = grassColor.map((x) => Math.max(0, x * 0.7 - 0.05));

        let adjacentTile = neighbors[(i+1)%6];
        if (!world.heightMap.contains(adjacentTile) || world.heightMap.get(adjacentTile) < world.heightMap.get(p) - 1) {
            let stoneColor = (light = 1) => {
                let bright = 1.25 + Math.random()*0.5;
                bright *= light;
                let grey = 0.4;
                return add(scale(bright*grey, hexColor), scale(1-grey, [1,1,1]));
            };
            addTriangle([ax, cornerAHeight, ay], [bx, cornerBHeight, by], [bx, 8, by], {vertexColor: stoneColor()}, "wall");
            addTriangle([ax, cornerAHeight, ay], [bx, 8, by], [ax, 8, ay], {vertexColor: stoneColor()}, "wall");
            for (let j = 0; j < 2; j++) {
                let wallDifference = subtract([bx, cornerBHeight, by], [ax, cornerAHeight, ay]);
                let wallDir = scale(1 / magnitude([wallDifference[0], 0, wallDifference[2]]), wallDifference);
                let outDir = unit([wallDir[2], 0, -wallDir[0]]);
                let wallLength = magnitude([wallDifference[0], 0, wallDifference[2]]);
                let boxLength = Math.random() * 0.2 + 0.15;
                let boxStart = Math.random() * (wallLength - boxLength);
                let boxWidth = Math.random() * 0.1 + 0.05;
                let boxHeight = Math.random() * 0.05 + 0.01;

                let topA: Vec3 = add([ax, cornerAHeight - boxHeight, ay], scale(boxStart, wallDir));
                let botA: Vec3 = add([ax, 8, ay], scale(boxStart, wallDir));
                let up: Vec3 = [0, -1, 0];

                let color = stoneColor();

                let addQuad = (a: Vec3, b: Vec3, d: Vec3, draw = color) => {
                    addTriangle(b, a, add(a, d), {vertexColor: draw}, "cliff");
                    addTriangle(b, add(a, d), add(b, d), {vertexColor: draw}, "cliff");
                };

                // front
                addQuad(
                    add(topA, scale(boxWidth/2, outDir), scale(boxHeight, up)),
                    add(botA, scale(boxWidth/2, outDir)),
                    scale(boxLength, wallDir),
                );
                // side 1
                addQuad(
                    add(botA, scale(-boxWidth/2, outDir)),
                    add(topA, scale(-boxWidth/2, outDir), scale(boxHeight, up)),
                    scale(boxLength, wallDir),
                );
                // side 2
                addQuad(
                    add(topA, scale(-boxWidth/2, outDir), scale(boxHeight, up)),
                    add(botA, scale(-boxWidth/2, outDir)),
                    scale(boxWidth, outDir),
                );
                // back
                addQuad(
                    add(botA, scale(-boxWidth/2, outDir), scale(boxLength, wallDir)),
                    add(topA, scale(-boxWidth/2, outDir), scale(boxHeight, up), scale(boxLength, wallDir)),
                    scale(boxWidth, outDir),
                );
                // top
                addQuad(
                    add(topA, scale(-boxWidth/2, outDir), scale(boxHeight, up), scale(boxLength, wallDir)),
                    add(topA, scale(-boxWidth/2, outDir), scale(boxHeight, up)),
                    scale(boxWidth, outDir),
                    grassColor,
                );
            }

            // TODO: only if the height difference is large enough
            for (let j = 0; j < 2; j++) {
                let wallDifference = subtract([bx, cornerBHeight, by], [ax, cornerAHeight, ay]);
                let wallDir = scale(1 / magnitude([wallDifference[0], 0, wallDifference[2]]), wallDifference);
                let outDir = unit([wallDir[2], 0, -wallDir[0]]);
                let wallLength = magnitude([wallDifference[0], 0, wallDifference[2]]);
                let boxLength = Math.random() * 0.2 + 0.25;
                let boxStart = Math.random() * (wallLength - boxLength);
                let boxWidth = Math.random() * 0.2 + 0.2;
                let boxHeight = -Math.random() * 1 - 0.15;

                let topA: Vec3 = add([ax, cornerAHeight - boxHeight, ay], scale(boxStart, wallDir));
                let botA: Vec3 = add([ax, 8, ay], scale(boxStart, wallDir));
                let up: Vec3 = [0, -1, 0];

                let color = stoneColor(0.75);

                let addQuad = (a: Vec3, b: Vec3, d: Vec3, draw = color) => {
                    addTriangle(b, a, add(a, d), {vertexColor: draw}, "cliff");
                    addTriangle(b, add(a, d), add(b, d), {vertexColor: draw}, "cliff");
                }

                // front
                addQuad(
                    add(topA, scale(boxWidth/2, outDir), scale(boxHeight, up)),
                    add(botA, scale(boxWidth/2, outDir)),
                    scale(boxLength, wallDir),
                );
                // side 1
                addQuad(
                    add(botA, scale(-boxWidth/2, outDir)),
                    add(topA, scale(-boxWidth/2, outDir), scale(boxHeight, up)),
                    scale(boxLength, wallDir),
                );
                // side 2
                addQuad(
                    add(topA, scale(-boxWidth/2, outDir), scale(boxHeight, up)),
                    add(botA, scale(-boxWidth/2, outDir)),
                    scale(boxWidth, outDir),
                );
                // back
                addQuad(
                    add(botA, scale(-boxWidth/2, outDir), scale(boxLength, wallDir)),
                    add(topA, scale(-boxWidth/2, outDir), scale(boxHeight, up), scale(boxLength, wallDir)),
                    scale(boxWidth, outDir),
                );
                // top
                addQuad(
                    add(topA, scale(-boxWidth/2, outDir), scale(boxHeight, up), scale(boxLength, wallDir)),
                    add(topA, scale(-boxWidth/2, outDir), scale(boxHeight, up)),
                    scale(boxWidth, outDir),
                );
            }// TODO: only conditioned on large difference (save triangles and avoid artifacts)
        }

        while (Math.random() < bladeChance) {
            // add a clump
            let dm = Math.random() + 0.1;
            let da = Math.random();
            let db = Math.random();
            let clumpX = (dm*wx + da*ax + db*bx) / (dm + da + db);
            let clumpY = (dm*wy + da*ay + db*by) / (dm + da + db);
            let clumpH = (dm*mainHeight + da*cornerAHeight + db*cornerBHeight) / (dm + da + db);

            let size = 0.5 + Math.random() * 0.3;

            for (let i = 0; i < 5 + Math.random() * 30; i++) {
                let ox = (Math.random()*2-1) * 0.05 * size;
                let oy = (Math.random()*2-1) * 0.05 * size;
                let om = Math.sqrt(ox**2 + oy**2);
                ox /= om;
                oy /= om;
                ox *= 0.05 * size;
                oy *= 0.05 * size;
                let sx = (Math.random()*2-1) * 0.05 * size;
                let sy = (Math.random()*2-1) * 0.05 * size;
                let lx = -oy;
                let ly = ox;
                let oh = (Math.random() * 0.2 + 0.05) * size;
                let bladeShade = Math.random() * 0.3 + 1.6;
                clumpX += sx;
                clumpY += sy;
                let bladeColor: Vec3 = [grassColor[0] * bladeShade, grassColor[1] * bladeShade, grassColor[2] * bladeShade];
                addTriangle([clumpX - lx, clumpH + 0.1, clumpY - ly], [clumpX - ox + lx, clumpH - oh, clumpY - oy + ly], [clumpX + ox + lx, clumpH - oh, clumpY + oy + ly], {vertexColor: bladeColor});
                addTriangle([clumpX - ox + lx, clumpH - oh, clumpY - oy + ly], [clumpX + 3*lx, clumpH - oh*2, clumpY + 3*ly], [clumpX + ox + lx, clumpH - oh, clumpY + oy + ly], {vertexColor: bladeColor});
                clumpX -= sx;
                clumpY -= sy;
            }
        }

        if (Math.random() < 1/30) {
            // add a rock
            let r = 0.05 + Math.random() * 0.1;
            let dm = Math.random() + 0.3 + r;
            let da = Math.random();
            let db = Math.random();
            let rockX = (dm*wx + da*ax + db*bx) / (dm + da + db);
            let rockY = (dm*wy + da*ay + db*by) / (dm + da + db);
            let rockH = (dm*mainHeight + da*cornerAHeight + db*cornerBHeight) / (dm + da + db);
            for (let s = 0; s < 7; s++) {
                let h = r;
                let d = 0.02;
                addTriangle(
                    [rockX + Math.cos(s/7*Math.PI*2)*r, rockH + d, rockY + Math.sin(s/7*Math.PI*2)*r],
                    [rockX, rockH - h, rockY],
                    [rockX + Math.cos((s+1)/7*Math.PI*2)*r, rockH + d, rockY + Math.sin((s+1)/7*Math.PI*2)*r],
                    {vertexColor: hexColor.map((x) => x * 0.3 + 0.6)},
                    "rock",
                );
            }
        }

        if (Math.random() < 1/100) {
            // add a city
            // first add a large central tower
            let color: Vec3 = [0.25, 0.25, 0.25];
            let addPillar = (corners: ((h: number) => Vec3)[], options: {count: number, base: Vec3, peak?: Vec3}) => {
                let {count, base} = options;
                let step = 1 / count;
                for (let h = 0; h <= 1; h += step) {
                    for (let i = 0; i < corners.length; i++) {
                        let f1 = (t: number) => options.peak && t >= 1 ? options.peak : corners[i](t);
                        let f2 = (t: number) => options.peak && t >= 1 ? options.peak : corners[(i+1)%corners.length](t);
                        addTriangle(
                            add(base, f2(h)),
                            add(base, f1(h)),
                            add(base, f2(h+step)),
                            {
                                vertexColor: color,
                                vertexBanding: 0,
                            },
                            "tower",
                        );
                        addTriangle(
                            add(base, f2(h+step)),
                            add(base, f1(h)),
                            add(base, f1(h+step)),
                            {
                                vertexColor: color,
                                vertexBanding: 0,
                            },
                            "tower",
                        );
                    }
                }
            };
            let {wx, wy} = hexToWorld(p);
            let reheight = (h: number) => -h * 0.25;
            let mainHeight = reheight(world.heightMap.get(p));
            let center: Vec3 = [wx, mainHeight, wy];
            let corners = [
                (h: number): Vec3 => h >= 1 ? [0, -h*1.0, 0] : [+0.4 / (2*h+1), -h*0.7, +0.1 / (h+1)],
                (h: number): Vec3 => h >= 1 ? [0, -h*1.0, 0] : [-0.1 / (h+1), -h*0.7, +0.1 / (h+1)],
                (h: number): Vec3 => h >= 1 ? [0, -h*1.0, 0] : [-0.1 / (h+1), -h*0.7, -0.1 / (h+1)],
                (h: number): Vec3 => h >= 1 ? [0, -h*1.0, 0] : [+0.05 / (h+1), -h*0.7, -0.1 / (h+1)],
            ];
            addPillar(corners, {base: center, count: 10});
            for (let i = 0; i < 7; i++) {
                let height = 0.4 + (i*3%7) / 12;
                let cs = [
                    (h: number): Vec3 => multiply([+0.03, -h * height, -0.03], Math.abs(h - 0.5) < 0.2 / height ? [1, 1, 1] : [2, 1, 2]),
                    (h: number): Vec3 => multiply([+0.03, -h * height, +0.03], Math.abs(h - 0.5) < 0.2 / height ? [1, 1, 1] : [2, 1, 2]),
                    (h: number): Vec3 => multiply([-0.03, -h * height, +0.00], Math.abs(h - 0.5) < 0.2 / height ? [1, 1, 1] : [2, 1, 2]),
                ];
                addPillar(cs, {
                    count: 10,
                    base: add(center, [Math.cos(i/7*Math.PI*2)*0.4, 0, Math.sin(i/7*Math.PI*2)*0.4]),
                    peak: [0, -(0.4 + (i*3%7) / 12), 0],
                });
            }
        }
    }
}

function perspectiveMatrices(options: {near: number, far: number, zoom: number, from: Vec3, to: Vec3}): {perspective: Mat4, camera: Mat4, cameraPosition: Mat4} {
    // TODO: allow roll
    let {near, far, zoom, from, to} = options;
    let forward = unit(subtract(from, to));
    let right = unit(cross(forward, [0, 1, 0]));
    let up = cross(forward, right);
    return {
        perspective: [
            zoom, 0, 0, 0,
            0, zoom, 0, 0,
            0, 0, (near+far) / (near-far), -1,
            0, 0, near*far/(near-far)*2, 0,
        ],
        camera: [
            right[0], up[0], forward[0], 0,
            right[1], up[1], forward[1], 0,
            right[2], up[2], forward[2], 0,
            0, 0, 0, 1,
        ],
        cameraPosition: [
            1, 0, 0, 0,
            0, 1, 0, 0,
            0, 0, 1, 0,
            -from[0], -from[1], -from[2], 1,
        ],
    };
}

// worldMesh.smoothAttribute("surface", "vertexColor", 0.01);
// worldMesh.smoothAttribute("surface", "vertexNormal", 0.01);
// worldMesh.smoothAttribute("rock", "vertexNormal", 0.1);
let worldRendered = meshTriangles; // worldMesh.render();

glacier.bufferTriangles(worldRendered);
let onlyPosition = worldRendered.map(triangle => triangle.map(vertex => ({vertexPosition: vertex.vertexPosition})));
shadowGlacier.bufferTriangles(onlyPosition); // slices to only take vertexPosition

let meanCenter: Vec3 = function(): Vec3 {
    let sum = {x: 0, y: 0};
    for (let tile of world.heightMap.cells()) {
        sum.x += hexToWorld(tile).wx;
        sum.y += hexToWorld(tile).wy;
    }
    sum.x /= world.heightMap.cells().length;
    sum.y /= world.heightMap.cells().length;
    return [sum.x, 0, sum.y];
}();

let cameraFocus = function() {
    let sum = {x: 0, y: 0};
    for (let tile of world.heightMap.cells()) {
        sum.x += hexToWorld(tile).wx;
        sum.y += hexToWorld(tile).wy;
    }
    sum.x /= world.heightMap.cells().length;
    sum.y /= world.heightMap.cells().length;
    return sum;
}();

let cameraZoom = -1;
let cameraViewAngle = 0;

let mouseStart = {x: 0, y: 0};
let isDown = false;
let mouseEnd = {x: 0, y: 0};
let mouseLast = {x: 0, y: 0};
let mouseCurrent = {x: 0, y: 0};

function computeCameraDistance() {
     return 5 / Math.pow(2, cameraZoom) + 3;
}
canvas.addEventListener("mousedown", function(e: MouseEvent) {
    isDown = true;
    mouseStart = {x: e.offsetX, y: e.offsetY};
    mouseLast = mouseStart;
}, false);
canvas.addEventListener("mousemove", function(e: MouseEvent) {
    mouseCurrent = {x: e.offsetX, y: e.offsetY};
    if (isDown) {
        cameraViewAngle -= (mouseCurrent.x - mouseLast.x) * 0.01;
        cameraZoom -= (mouseCurrent.y - mouseLast.y) * 0.01;
        cameraZoom = clamp(-2, cameraZoom, 2.5);
    }
    mouseLast = mouseCurrent;
}, false);
document.addEventListener("mouseup", function(e) {
    isDown = false;
    mouseEnd = mouseCurrent;
}, false);
let touchData: {[k: string]: {start: {x: number, y: number}, last: {x: number, y: number}}} = {};
canvas.addEventListener('touchstart', function(e: TouchEvent) {
    e.preventDefault();
    for (let i = 0; i < e.changedTouches.length; i++) {
        let started = e.changedTouches.item(i)!;
        touchData[started.identifier] = {
            start: {x: started.clientX - canvas.clientLeft, y: started.clientY - canvas.clientTop},
            last: {x: started.clientX - canvas.clientLeft, y: started.clientY - canvas.clientTop},
        };
    }
});
canvas.addEventListener('touchend', function(e: TouchEvent) {
    e.preventDefault();
    for (let i = 0; i < e.changedTouches.length; i++) {
        let ended = e.changedTouches.item(i)!;
        delete touchData[ended.identifier];
    }
});
canvas.addEventListener('touchmove', function(e) {
    let speed = 0.003 * computeCameraDistance();
    for (let i = 0; i < e.changedTouches.length; i++) {
        let changed = e.changedTouches.item(i);
        if (changed && changed.identifier in touchData) {
            let data = touchData[changed.identifier];
            let position = {x: changed.clientX - canvas.clientLeft, y: changed.clientY - canvas.clientTop};
            let delta = {x: position.x - data.last.x, y: position.y - data.last.y};
            let cameraRegion = ({x, y}: {x: number, y: number}) => {
                let border = 0.15;
                let minusBorder = 1 - border;
                return x < canvas.offsetWidth * border || x > canvas.offsetHeight * (1 - border) || y < canvas.offsetHeight * border || y > canvas.offsetHeight * (1 - border);
            };
            if (cameraRegion(data.start)) {
                // move the world
                cameraFocus.x += Math.sin(cameraViewAngle) * delta.x * speed;
                cameraFocus.y -= Math.cos(cameraViewAngle) * delta.x * speed;

                cameraFocus.x -= Math.cos(cameraViewAngle) * delta.y * speed;
                cameraFocus.y -= Math.sin(cameraViewAngle) * delta.y * speed;
            } else {
                // move the camera
                cameraViewAngle -= delta.x * 0.01;
                cameraZoom -= delta.y * 0.01;
                cameraZoom = clamp(-2, cameraZoom, 2.5);
            }
            data.last = position;
        }
    }
}, false);
let keysDown: {[k: string]: boolean} = {};
document.addEventListener('keydown', function(e: KeyboardEvent) {
    keysDown[e.key] = true;
}, false);
document.addEventListener('keyup', function(e: KeyboardEvent) {
    keysDown[e.key] = false;
}, false);
let shift = Math.PI / 2;
// Now, we get ready to draw our triangle:
let lastTick = Date.now();
function loop() {
    let currentTick = Date.now();
    let delta = currentTick - lastTick;
    lastTick = currentTick;
    window.requestAnimationFrame(loop);
    let cameraDistance = computeCameraDistance();

    let speed = 0.01;
    if (keysDown.w) {
        cameraFocus.x -= Math.cos(cameraViewAngle) * delta * speed;
        cameraFocus.y -= Math.sin(cameraViewAngle) * delta * speed;
    }
    if (keysDown.s) {
        cameraFocus.x += Math.cos(cameraViewAngle) * delta * speed;
        cameraFocus.y += Math.sin(cameraViewAngle) * delta * speed;
    }
    if (keysDown.a) {
        cameraFocus.x += Math.sin(cameraViewAngle) * delta * speed;
        cameraFocus.y -= Math.cos(cameraViewAngle) * delta * speed;
    }
    if (keysDown.d) {
        cameraFocus.x -= Math.sin(cameraViewAngle) * delta * speed;
        cameraFocus.y += Math.cos(cameraViewAngle) * delta * speed;
    }


    let from: Vec3 = [
        Math.cos(cameraViewAngle) * cameraDistance + cameraFocus.x,
        -cameraDistance,
        Math.sin(cameraViewAngle) * cameraDistance + cameraFocus.y,
    ];
    let to: Vec3 = [
        cameraFocus.x,
        0,
        cameraFocus.y,
    ];
    let forward: Vec3 = unit(subtract(from, to));
    let right = unit(cross(forward, [0, 1, 0]));
    let up = cross(forward, right);
    let {perspective, camera, cameraPosition} = perspectiveMatrices({near: 0.1, far: 80, zoom: 2, from, to})
    let shadowSource: Vec3 = add(meanCenter, scale(70, lightDirection));
    let shadowScale = 100;
    let shadowZoom = 2;
    let {perspective: shadowPerspective, camera: shadowCamera, cameraPosition: shadowCameraPosition} = perspectiveMatrices({near: 0.1, far: shadowScale + 1, zoom: shadowZoom, from: shadowSource, to: meanCenter});
    shadowGlacier.activate();
    shadowGlacier.setUniform({
        perspective: shadowPerspective,
        camera: shadowCamera,
        cameraPosition: shadowCameraPosition,
        shadowSource,
        shadowScale,
    });
    shadowGlacier.draw({clearColor: [1, 1, 1]});
    shadowGlacier.deactivate();
    glacier.activate();
    if ((window as any).debug_shadow) {
        perspective = shadowPerspective;
        camera = shadowCamera;
        cameraPosition = shadowCameraPosition;
    }
    glacier.setUniform({
        perspective,
        camera,
        cameraPosition,
        lightDirection,
        shadowMap: {index: 0, texture: getGlacialTexture(shadowGlacier)}, // TODO: sorta spooky
        shadowPerspective,
        shadowCamera,
        shadowCameraPosition,
        shadowSource,
        shadowScale,
    });
    glacier.draw({clearColor: [0, 0, 0]});
    glacier.deactivate();
    
}

loop();
