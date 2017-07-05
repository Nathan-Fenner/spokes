
import {HexPos, HexMap, generateMap} from './generation'

import {clamp, randomChoose, median, range, distinct, middle} from './utility'

import {Vec3, Mat4, add, scale, subtract, multiply, magnitude, unit, cross} from './matrix'

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
        time: Glacier.float,
        lightDirection: Glacier.vec3,
        shadowMap: Glacier.image,
        shadowPerspective: Glacier.mat4,
        shadowCamera: Glacier.mat4,
        shadowCameraPosition: Glacier.mat4,
        source: Glacier.vec3,
        shift: Glacier.vec2,
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

    uniform float time;
    uniform vec3 lightDirection;
    uniform sampler2D shadowMap;

    uniform mat4 shadowPerspective;
    uniform mat4 shadowCamera;
    uniform mat4 shadowCameraPosition;
    uniform vec3 source;

    uniform vec2 shift;

    varying vec3 fragmentPosition;
    varying vec3 fragmentColor;
    varying vec3 fragmentNormal;
    varying float fragmentBanding;
    
    uniform mat4 perspective;
    uniform mat4 cameraPosition;
    uniform mat4 camera;
    
    float random( vec3 p )
    {
        vec3 r = vec3(2.314069263277926,2.665144142690225, -1.4583722432222111 );
        return fract( cos( mod( 12345678., 256. * dot(p,r) ) ) + cos( mod( 87654321., 256. * dot(p.zyx,r) ) ) );
    }
    float smoothNoise( vec2 p ) {
        vec3 f = vec3(floor(p), 1.0);
        float f0 = mix( random(f + vec3(0.0, 0.0, 0.0)), random(f + vec3(1.0, 0.0, 0.0)), fract(p.x) );
        float f1 = mix( random(f + vec3(0.0, 1.0, 0.0)), random(f + vec3(1.0, 1.0, 0.0)), fract(p.x) );
        return mix( f0, f1, fract(p.y) );
    }
    float cloudNoise( vec2 x, float f, float a ) {
        float s = 0.0;
        for (int i = 0; i < 5; i++) {
            vec2 arg = x * pow(f, float(i));
            s += smoothNoise(arg) * pow(a, float(i));
        }
        return s * (1.0 - a);
    }

    
    void main(void) {
        float y = min(1.0, max(0.0, 0.6 - fragmentPosition.y * 0.2));
        float noise = random(floor(15.0 * fragmentPosition));
        float lambert = dot(normalize(fragmentNormal), normalize(lightDirection)) * 0.35 + 0.65;
        gl_FragColor = vec4(lambert * y * fragmentColor, 1.0);
        float originalHeight = fragmentPosition.y * -4.0;
        float n = cloudNoise(fragmentPosition.xz, 2.0, 0.5);
        if (fract(originalHeight - 0.4 + (n-0.5)*0.8) < 0.2 && gl_FragColor.g > gl_FragColor.r * 1.3) {
            // gl_FragColor.rgb *= 0.75;
        }
        if (fragmentBanding > 0.91) {
            gl_FragColor.rgb *= 0.96;
        }
        if (fragmentBanding > 0.95) {
            gl_FragColor.rgb *= 0.95;
        }

        // shadow map debugging below

        vec4 projected = shadowPerspective * shadowCamera * shadowCameraPosition * vec4(fragmentPosition, 1.0);
        vec2 screen = projected.xy / projected.w;
        if (abs(screen.x) < 1.0 && abs(screen.y) < 1.0) {
            float shadowDistance = texture2D(shadowMap, screen*0.5 + 0.5).r;
            float realDistance = max(0.0, min(1.0, distance(fragmentPosition, source) / 50.0));
            if (realDistance > shadowDistance + 0.01 || dot(lightDirection  , fragmentNormal) < 0.0) {
                gl_FragColor.rgb *= 0.5;
            }
        }
    }
    `,
    specification,
    context: gl,
    target: "screen",
});

glacier.activate();

let shadowSpecification = {
    uniforms: {
        perspective: Glacier.mat4,
        camera: Glacier.mat4,
        cameraPosition: Glacier.mat4,
        source: Glacier.vec3,
    },
    attributes: {
        vertexPosition: Glacier.vec3,
        vertexNormal: Glacier.vec3,
    },
};

export let shadowGlacier = new Glacier<typeof shadowSpecification, "texture">({
    vertexShader: `
    precision mediump float;
    uniform mat4 perspective;
    uniform mat4 cameraPosition;
    uniform mat4 camera;

    attribute vec3 vertexPosition;
    attribute vec3 vertexNormal;

    varying vec3 fragmentPosition;
    varying vec3 fragmentNormal;

    void main(void) {
        gl_Position = perspective * camera * cameraPosition * vec4(vertexPosition, 1.0);
        fragmentPosition = vertexPosition;
        fragmentNormal = vertexNormal;
    }
    `,
    fragmentShader: `
    precision mediump float;

    varying vec3 fragmentPosition;
    varying vec3 fragmentNormal;

    uniform vec3 source;

    void main(void) {
        gl_FragColor = vec4(max(0.0, min(0.99, distance(fragmentPosition, source) / 50.0)) * vec3(1.0, 1.0, 1.0), 1.0);
    }
    `,
    specification: shadowSpecification,
    context: gl,
    target: "texture",
});

let light: Vec3 = [2, -2, 2];

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
        {vertexPosition: va, vertexNormal: normal, vertexColor: attributes.vertexColor, vertexBanding: 0},
        {vertexPosition: vb, vertexNormal: normal, vertexColor: attributes.vertexColor, vertexBanding: banding},
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

        addTriangle([wx, mainHeight, wy], [ax, cornerAHeight, ay], [bx, cornerBHeight, by], {vertexColor: hexColor, vertexBanding: 1}, "surface");

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
                    add(topA, scale(-boxWidth/2, outDir), scale(boxHeight, up)),
                    add(topA, scale(-boxWidth/2, outDir), scale(boxHeight, up), scale(boxLength, wallDir)),
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
                    add(topA, scale(-boxWidth/2, outDir), scale(boxHeight, up)),
                    add(topA, scale(-boxWidth/2, outDir), scale(boxHeight, up), scale(boxLength, wallDir)),
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
                    [rockX, rockH - h, rockY],
                    [rockX + Math.cos(s/7*Math.PI*2)*r, rockH + d, rockY + Math.sin(s/7*Math.PI*2)*r],
                    [rockX + Math.cos((s+1)/7*Math.PI*2)*r, rockH + d, rockY + Math.sin((s+1)/7*Math.PI*2)*r],
                    {vertexColor: hexColor.map((x) => x * 0.3 + 0.6)},
                    "rock",
                );
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
shadowGlacier.bufferTriangles(worldRendered); // slices to only take vertexPosition

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
canvas.addEventListener('touchstart', function(e: TouchEvent) {
    e.preventDefault();
    isDown = true;
    mouseStart = {x: e.touches[0].clientX, y: e.touches[0].clientY};
    mouseLast = mouseStart;
}, false);
canvas.addEventListener('touchmove', function(e) {
    mouseCurrent = {x: e.touches[0].clientX, y: e.touches[0].clientY};
    if (isDown) {
        cameraViewAngle -= (mouseCurrent.x - mouseLast.x) * 0.01;
        cameraZoom -= (mouseCurrent.y - mouseLast.y) * 0.01;
        cameraZoom = clamp(-2, cameraZoom, 2.5);
    }
    mouseLast = mouseCurrent;
}, false);
canvas.addEventListener('touchcancel', function(e) {
    isDown = false;
    e.preventDefault();
}, false);
canvas.addEventListener('touchend', function(e) {
    isDown = false;
    e.preventDefault();
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
    let cameraDistance = 5 / Math.pow(2, cameraZoom) + 3;
    let t = Date.now() / 1000 / 10;

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
    let source: Vec3 = [-20, -20, -20];
    let {perspective: shadowPerspective, camera: shadowCamera, cameraPosition: shadowCameraPosition} = perspectiveMatrices({near: 0.1, far: 70, zoom: 1, from: source, to: [0, 0, 0]});
    shadowGlacier.activate();
    shadowGlacier.setUniform({
        perspective: shadowPerspective,
        camera: shadowCamera,
        cameraPosition: shadowCameraPosition,
        source,
    });
    shadowGlacier.draw({clearColor: [0, 0, 0]}); // something is wrong
    shadowGlacier.deactivate();
    glacier.activate();
    glacier.setUniform({
        perspective,
        camera,
        cameraPosition,
        lightDirection: light,
        time: Date.now() / 1000 % 1000,
        shadowMap: {index: 0, texture: getGlacialTexture(shadowGlacier)}, // TODO: sorta spooky
        shadowPerspective,
        shadowCamera,
        shadowCameraPosition,
        source,
        shift: (window as any).shift as [number, number] || [0,0],
    });
    glacier.draw({clearColor: [0, 0, 0]});
    glacier.deactivate();
    
}

loop();
