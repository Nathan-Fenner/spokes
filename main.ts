
import {HexPos, HexMap, generateMap} from './generation'

import {clamp, randomChoose, median, range, distinct, middle} from './utility'

import {Vec3, add, scale, subtract, magnitude, unit, cross} from './matrix'

import {Glacier} from './glacial';

let canvas = document.getElementById("canvas") as HTMLCanvasElement;
canvas.width = 900;
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
    },
    attributes: {
        vertexPosition: Glacier.vec3,
        vertexColor: Glacier.vec3,
        vertexNormal: Glacier.vec3,
    },
};

export let glacier = new Glacier<typeof specification>({
    vertexShader: `
    precision mediump float;
    uniform mat4 perspective;
    uniform mat4 cameraPosition;
    uniform mat4 camera;

    attribute vec3 vertexPosition;
    attribute vec3 vertexColor;
    attribute vec3 vertexNormal;

    varying vec3 fragmentPosition;
    varying vec3 fragmentColor;
    varying vec3 fragmentNormal;

    void main(void) {
        gl_Position = perspective * camera * cameraPosition * vec4(vertexPosition, 1.0);
        fragmentPosition = vertexPosition;
        fragmentColor = vertexColor;
        fragmentNormal = vertexNormal;
    }
    `,
    fragmentShader: `
    precision mediump float;

    uniform float time;
    uniform vec3 lightDirection;

    varying vec3 fragmentPosition;
    varying vec3 fragmentColor;
    varying vec3 fragmentNormal;

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
    }
    `,
    specification,
    context: gl,
});

glacier.activate();

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

// Here we create a regular JS array to store the coordinates of the triangle's corners.
// The Z component will be 0 for all of them.

let world = generateMap();

// TODO: hierarchical meshes?
// let worldMesh = new Mesh({vertexColor: "vec3"}, "vertexPosition", "vertexNormal");

type MeshVertex = {
    vertexPosition: Vec3,
    vertexNormal: Vec3,
    vertexColor: Vec3,
};

let meshTriangles: [MeshVertex, MeshVertex, MeshVertex][] = [];

function triangleNormal(a: Vec3, b: Vec3, c: Vec3): Vec3 {
    return unit(cross(subtract(b, a), subtract(c, a)));
}

function addTriangle(va: Vec3, vb: Vec3, vc: Vec3, attributes: {vertexColor: Vec3}, group?: string) {
    let normal = triangleNormal(va, vb, vc);
    meshTriangles.push([{vertexPosition: va, vertexNormal: normal, vertexColor: attributes.vertexColor}, {vertexPosition: vb, vertexNormal: normal, vertexColor: attributes.vertexColor}, {vertexPosition: vc, vertexNormal: normal, vertexColor: attributes.vertexColor}]);
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

        addTriangle([wx, mainHeight, wy], [ax, cornerAHeight, ay], [bx, cornerBHeight, by], {vertexColor: hexColor}, "surface");

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

// worldMesh.smoothAttribute("surface", "vertexColor", 0.01);
// worldMesh.smoothAttribute("surface", "vertexNormal", 0.01);
// worldMesh.smoothAttribute("rock", "vertexNormal", 0.1);
let worldRendered = meshTriangles; // worldMesh.render();

glacier.bufferTriangles(worldRendered);

// Set the size of the view:
canvas.width = 600; // TODO: explain about CSS here
canvas.height = 600;

function normalizeSet(vec: Vec3) {
    let mag = Math.sqrt(vec[0]*vec[0] + vec[1]*vec[1] + vec[2]*vec[2]);
    vec[0] /= mag;
    vec[1] /= mag;
    vec[2] /= mag;
}

function scaleSet(u: Vec3, k: number) {
    u[0] *= k;
    u[1] *= k;
    u[2] *= k;
}

function pos(): Vec3 {
    let r = Math.cos(Date.now() / 100)/1000 + 6;
    return [Math.cos(Date.now() / 1000) * r, 0.4, Math.sin(Date.now() / 1000) * r];
}
let global = {
    forward: [0,0,0],
    right: [0,0,0],
    up: [0,0,0],
};
function lookAt(from: Vec3, to: Vec3): number[] {
    let forward: Vec3 = [to[0] - from[0], to[1] - from[1], to[2] - from[2]];
    normalizeSet(forward);
    let right = cross(forward, [0, 1, 0]);
    normalizeSet(right);
    let up = cross(forward, right);
    global = {forward, right, up};
    return [
        right[0], up[0], forward[0], -from[0],
        right[1], up[1], forward[1], -from[1],
        right[2], up[2], forward[2], -from[2],
        0, 0, 0, 1,
    ];
}
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
    let near = 0.1;
    let far = 80;
    let cameraDistance = 10 / Math.pow(2, cameraZoom);
    let zoomScale = 2;
    glacier.setUniform({
        perspective: [
            zoomScale, 0, 0, 0,
            0, zoomScale, 0, 0,
            0, 0, (near+far) / (near-far), -1,
            0, 0, near*far/(near-far)*2, 0,
        ],
    });
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


    let from = [
        Math.cos(cameraViewAngle) * cameraDistance + cameraFocus.x,
        -3 - 0.5 * cameraDistance,
        Math.sin(cameraViewAngle) * cameraDistance + cameraFocus.y,
    ];
    let to = [
        cameraFocus.x,
        0,
        cameraFocus.y,
    ];
    let forward: Vec3 = [to[0] - from[0], to[1] - from[1], to[2] - from[2]];
    normalizeSet(forward); // make it into a unit vector
    scaleSet(forward, -1);
    let right = cross(forward, [0, 1, 0]);
    normalizeSet(right);
    let up = cross(forward, right);
    glacier.setUniform({
        camera: [
            right[0], up[0], forward[0], 0,
            right[1], up[1], forward[1], 0,
            right[2], up[2], forward[2], 0,
            0, 0, 0, 1,
        ],
        lightDirection: light,
        time: Date.now() / 1000 % 1000,
        cameraPosition: [
            1, 0, 0, 0,
            0, 1, 0, 0,
            0, 0, 1, 0,
            -from[0], -from[1], -from[2], 1,
        ],
    });
    glacier.draw({clearColor: [0, 0, 0]});
}

loop();
