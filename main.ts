
import {HexPos, HexMap, generateMap} from './generation'

import {clamp, randomChoose, median, range, distinct, middle} from './utility'


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

// We're going to make a basic program to start.

// We'll just have a triangle.

// To do this, we have to introduce our first GL concept: shaders.

// A "shader" is a program that runs on the GPU. The language that WebGL uses
// is called GLSL. It looks something like C, though it's a lot simpler.

// This is a modern (i.e. ES2016) feature called template literals.
// It's basically a multiline string.

let vertexShaderSource = `
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
`;

// An `attribute` is a value that's passed from the CPU (JavaScript)
// to the GPU (WebGL); in this case, per-vertex.
// It's declared as a vec3, a vector in 3D space.

// `main` is the shader function that runs for each vertex.
// `void` indicates that it returns nothing and takes no arguments.

// `gl_Position` is a global where we store the location of this triangle.
// You might think that locations in space could just be represented in 3
// coordinates; forward, left/right, and up/down (x, y, z, in some order).
// However, for reasons that we can explore in more detail later
// (that have to do with perspective and depth), `gl_Position` is a vec4.
// We just set the 4th component (called w) to 1.0 for now.

// Whew!

// Now let's color the triangle. It'll just be red:

let fragmentShaderSource = `
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
`;

// This is a fragment shader. It colors "fragments", which are usually
// pixels, at least until you're doing something more complicated.
// The GPU runs the fragment shader once for each pixel in every
// triangle that you draw. Its main job is to determine those pixels' colors.

// The declaration on the first line is not too important. It says to use
// 'medium' precision for floating-point (decimal) numbers. You can mostly
// just always include this incantation, at least until you know what you're
// doing.

// Just like `gl_Position`, we have the global `gl_FragColor` here.
// It's a vec4 of the form (R, G, B, A), referring to the red, green, blue,
// and alpha components of the color. An `alpha` of 1.0 is fully opaque and
// an `alpha` of 0.0 is fully invisible. Transparency is actually a little complicated,
// so for now we'll make everything opaque. Note that all values are in the range
// [0.0, 1.0].

// Whew! We'll now have to compile these shaders into programs that the GPU can run.

// We ask WebGL to create a shader object for us: 
let vertexShader = gl.createShader(gl.VERTEX_SHADER);
// Next, we tell it the source to use:
gl.shaderSource(vertexShader, vertexShaderSource);
// And now we ask it to be compiled:
gl.compileShader(vertexShader);
// Compilation is pretty fast, but not so fast you want to do it constantly.
// Shaders should be loaded up front, at the start of the program or the start of a scene, generally.

// Let's make sure nothing went wrong:
if (!gl.getShaderParameter(vertexShader, gl.COMPILE_STATUS)) {
    // This checks whether the shader compiled successfully.
    // This can fail if your hardware doesn't support an operation you want to perform,
    // or there's a syntax error in your shader script.
    console.log("err:", gl.getShaderInfoLog(vertexShader));
    throw "error loading vertex shader";
}

// Now we do the same thing for the fragment shader:

let fragmentShader = gl.createShader(gl.FRAGMENT_SHADER);
gl.shaderSource(fragmentShader, fragmentShaderSource);
gl.compileShader(fragmentShader);
if (!gl.getShaderParameter(fragmentShader, gl.COMPILE_STATUS)) {
    console.log(gl.getShaderInfoLog(fragmentShader));
    throw "error loading fragment shader";
}

// Next, we combine the two shaders into a `Program`.
// The Program is what's actually run on the GPU.

let shaderProgram = gl.createProgram();
// We attach both of the shaders to the program.
// You can think of a program as basically a bundle
// of the things you need to actually run.
gl.attachShader(shaderProgram, vertexShader);
gl.attachShader(shaderProgram, fragmentShader);
// Then, we link it. The pieces were already compiled,
// this just puts everything together.
gl.linkProgram(shaderProgram);

// Here's some more error checking. Nothing ought to go wrong,
// but it's still good to check.
if (!gl.getProgramParameter(shaderProgram, gl.LINK_STATUS)) {
    console.log(gl.getProgramInfoLog(shaderProgram));
    throw "error linking program";
}

// When we want to draw different kinds of things, we can switch programs.
// To start, we need to switch to the one we just made:
gl.useProgram(shaderProgram);

// If you look back at the vertex shader script, we had an attribute called
// `vertexPosition`. We need to ask WebGL how to refer to that location.
let vertexPositionAttribute = gl.getAttribLocation(shaderProgram, "vertexPosition");
// We also have to turn it on:
gl.enableVertexAttribArray(vertexPositionAttribute);

let vertexColorAttribute = gl.getAttribLocation(shaderProgram, "vertexColor");
gl.enableVertexAttribArray(vertexColorAttribute);

let vertexNormalAttribute = gl.getAttribLocation(shaderProgram, "vertexNormal");
gl.enableVertexAttribArray(vertexNormalAttribute);

// get the perspective uniform
let perspectiveUniform = gl.getUniformLocation(shaderProgram, "perspective")!;
let cameraPositionUniform = gl.getUniformLocation(shaderProgram, "cameraPosition")!;
let cameraUniform = gl.getUniformLocation(shaderProgram, "camera")!;
let timeUniform = gl.getUniformLocation(shaderProgram, "time")!;
let lightingUniform = gl.getUniformLocation(shaderProgram, "lightDirection")!;


let light = [2, -2, 2];

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

type Vec2 = [number, number];
type Vec3 = [number, number, number];
type Vec4 = [number, number, number, number];
type Mat4 = [
    number, number, number, number,
    number, number, number, number,
    number, number, number, number,
    number, number, number, number
];
type VecN = [null, number, Vec2, Vec3, Vec4]; // TODO: more
type VecLength = 0 | 1 | 2 | 3; // attributes allows


function cross(u: Vec3, v: Vec3): Vec3 {
    return [u[1]*v[2] - u[2]*v[1], u[2]*v[0] - u[0]*v[2], u[0]*v[1] - u[1]*v[0]];
}
function subtract(u: Vec3, v: Vec3): Vec3 {
    return [u[0] - v[0], u[1] - v[1], u[2] - v[2]];
}
function add(...us: Vec3[]): Vec3 {
    let sum: Vec3 = [0, 0, 0];
    for (let u of us) {
        sum[0] += u[0];
        sum[1] += u[1];
        sum[2] += u[2];
    }
    return sum;
}
function plus(u: Vec3, v: Vec3): Vec3 {
    return add(u, v);
}
function scale(k: number, v: Vec3): Vec3 {
    return [k*v[0], k*v[1], k*v[2]];
}
function dot(a: Vec3, b: Vec3): number {
    let s = 0;
    s += a[0] * b[0];
    s += a[1] * b[1];
    s += a[2] * b[2];
    return s;
}
function magnitude(v: Vec3): number {
    return Math.sqrt(v[0]**2 + v[1]**2 + v[2]**2);
}
function distance(v: Vec3, u: Vec3): number {
    return magnitude(subtract(v, u));
}
function unit(v: Vec3): Vec3 {
    return scale(1 / magnitude(v), v);
}


type Vertex = {
    position: Vec3;
    color: Vec3;
    normal: Vec3;
};

type Triangle = {
    vertices: [Vertex, Vertex, Vertex];
    smoothingGroup?: string;
};

type PointSetBranch<T> = {
    next: {pivot: Vec3, value: T, low: PointSetBranch<T>, high: PointSetBranch<T>} | null;
    dimension: 0 | 1 | 2;
};

function compressPath(path: string): string {
    return path.replace(/LL/g, "A").replace(/RR/g, "B").replace(/LR/g, "C").replace(/RL/g, "D");
}

class PointSet<T> {
    levels: PointSetBranch<T>;
    constructor() {
        this.levels = {dimension: 0, next: null};
    }
    find(p: Vec3, eps: number): {path: string, value: T} | null {
        let signature = "";
        let roots = [{root: this.levels, path: "_"}];
        while (roots.length > 0) {
            let {root, path} = roots.pop()!;
            let next = root.next;
            if (!next) {
                continue; // nothing to do
            }
            if (distance(next.pivot, p) < eps) {
                return {path: compressPath(path), value: next.value};
            }
            if (p[root.dimension] < next.pivot[root.dimension] + eps) {
                roots.push({root: next.low, path: path + "L"});
            }
            if (p[root.dimension] > next.pivot[root.dimension] - eps) {
                roots.push({root: next.high, path: path + "H"});
            }
        }
        return null;
    }
    insertInto(p: Vec3, root: PointSetBranch<T>, v: T, eps: number) {
        let dimensions: [0, 1, 2] = [0, 1, 2];
        if (root.next) {
            if (distance(p, root.next.pivot) < eps) {
                throw "bad behavior: do not insert point with nearby neighbor";
            }
            if (p[root.dimension] < root.next.pivot[root.dimension]) {
                this.insertInto(p, root.next.low, v, eps);
            } else {
                this.insertInto(p, root.next.high, v, eps);
            }
        } else {
            root.next = {
                pivot: p,
                value: v,
                low: {dimension: randomChoose(dimensions), next: null},
                high: {dimension: randomChoose(dimensions), next: null},
            }
        }
    }
    insertPoints(ps: {p: Vec3, v: T}[], eps: number) {
        let qs = ps.slice(0);
        for (let i = 0; i < qs.length; i++) {
            let j = i + Math.random() * (qs.length - i) | 0
            let a = qs[i];
            let b = qs[j];
            qs[i] = b;
            qs[j] = a;
        }
        for (let {p, v} of qs) {
            if (!this.find(p, eps)) {
                this.insertInto(p, this.levels, v, eps);
            }
        }
    }
}

let attributeCombiner = {
    normal: (list: Vec3[]): Vec3 => unit(list.reduce(plus, [0, 0, 0])),
    color: (list: Vec3[]): Vec3 => scale(1 / list.length, list.reduce(plus, [0, 0, 0])),
};

class Mesh {
    triangles: Triangle[];
    constructor() {
        this.triangles = [];
    }
    count() {
        return this.triangles.length;
    }
    addGeneral(vertices: [Vertex, Vertex, Vertex]) {
        this.triangles.push({vertices});
    }
    addSingleColor(positions: [Vec3, Vec3, Vec3], color: Vec3, smoothingGroup?: string) {
        // note that orientation matters to determine normal
        let normal = unit(cross(subtract(positions[1], positions[0]), subtract(positions[2], positions[0])));
        this.triangles.push({
            vertices: [
                { position: positions[0], color, normal },
                { position: positions[1], color, normal },
                { position: positions[2], color, normal },
            ],
            smoothingGroup,
        });
    }
    removeDoubledSurfaces() {
        const EPS = 0.001;
        let allPoints: {p: Vec3, v: null}[] = [];
        for (let triangle of this.triangles) {
            allPoints.push(...triangle.vertices.map((x) => ({p: x.position, v: null})));
        }
        let tree = new PointSet<null>();
        tree.insertPoints(allPoints, EPS);
        function describeVertex(vertex: Vertex): string {
            let result = tree.find(vertex.position, EPS);
            if (result) {
                return result.path;
            }
            (window as any).blub = tree;
            (window as any).flub = vertex.position;
            throw "invalid";
        }
        function describe(triangle: Triangle): string {
            return triangle.vertices.map(describeVertex).sort().join(":");
        }
        let triangleCount: {[k: string]: number} = {};
        for (let triangle of this.triangles) {
            let description = describe(triangle);
            if (description in triangleCount) {
                triangleCount[description]++;
            } else {
                triangleCount[description] = 1;
            }
        }
        let newTriangles: Triangle[] = [];
        for (let triangle of this.triangles) {
            let description = describe(triangle);
            if (triangleCount[description] >= 2) {
                continue;
            }
            newTriangles.push(triangle);
        }
        this.triangles = newTriangles;
    }
    render(): {positions: Float32Array, normals: Float32Array, colors: Float32Array} {
        let positions: number[] = [];
        let colors: number[] = [];
        let normals: number[] = [];
        for (let triangle of this.triangles) {
            for (let vertex of triangle.vertices) {
                positions.push(...vertex.position);
                colors.push(...vertex.color);
                normals.push(...vertex.normal);
            }
        }
        return {
            positions: new Float32Array(positions),
            colors: new Float32Array(colors),
            normals: new Float32Array(normals),
        }
    }
    smoothAttribute(group: string, attribute: "normal" | "color", eps: number) {
        let pointMap: {[hash: string]: {[g: string]: Vec3[]}} = {};
        let hash = (x: Vec3) => Math.floor(x[0] / eps) + ":" + Math.floor(x[1] / eps) + ":" + Math.floor(x[2] / eps);
        for (let triangle of this.triangles) {
            if (triangle.smoothingGroup != group) {
                continue;
            }
            for (let vertex of triangle.vertices) {
                pointMap[hash(vertex.position)] = pointMap[hash(vertex.position)] || [];
                pointMap[hash(vertex.position)][triangle.smoothingGroup] = [];
            }
        }
        for (let triangle of this.triangles) {
            if (triangle.smoothingGroup != group) {
                continue;
            }
            for (let vertex of triangle.vertices) {
                pointMap[hash(vertex.position)][triangle.smoothingGroup].push(vertex[attribute]);
            }
        }
        for (let triangle of this.triangles) {
            if (triangle.smoothingGroup != group) {
                continue;
            }
            for (let vertex of triangle.vertices) {
                let otherAttributes = pointMap[hash(vertex.position)][triangle.smoothingGroup];
                let combined = attributeCombiner[attribute](otherAttributes);
                vertex[attribute] = combined;
                // nearbyNormals[1 % nearbyNormals.length];
                // unit(nearbyNormals.reduce(add, [0, 0, 0]));
            }
        }
    }
}

let world = generateMap();

// TODO: hierarchical meshes?
let worldMesh = new Mesh();

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

        worldMesh.addSingleColor([[wx, mainHeight, wy], [ax, cornerAHeight, ay], [bx, cornerBHeight, by]], hexColor, "surface");

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
            worldMesh.addSingleColor([[ax, cornerAHeight, ay], [bx, cornerBHeight, by], [bx, 8, by]], stoneColor(), "wall");
            worldMesh.addSingleColor([[ax, cornerAHeight, ay], [bx, 8, by], [ax, 8, ay]], stoneColor(), "wall");
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
                    worldMesh.addSingleColor([b, a, add(a, d)], draw, "cliff");
                    worldMesh.addSingleColor([b, add(a, d), add(b, d)], draw, "cliff");
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
                    worldMesh.addSingleColor([b, a, add(a, d)], draw, "cliff");
                    worldMesh.addSingleColor([b, add(a, d), add(b, d)], draw, "cliff");
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
                worldMesh.addSingleColor([[clumpX - lx, clumpH + 0.1, clumpY - ly], [clumpX - ox + lx, clumpH - oh, clumpY - oy + ly], [clumpX + ox + lx, clumpH - oh, clumpY + oy + ly]], bladeColor);
                worldMesh.addSingleColor([[clumpX - ox + lx, clumpH - oh, clumpY - oy + ly], [clumpX + 3*lx, clumpH - oh*2, clumpY + 3*ly], [clumpX + ox + lx, clumpH - oh, clumpY + oy + ly]], bladeColor);
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
                worldMesh.addSingleColor(
                    [
                        [rockX, rockH - h, rockY,],
                        [rockX + Math.cos(s/7*Math.PI*2)*r, rockH + d, rockY + Math.sin(s/7*Math.PI*2)*r],
                        [rockX + Math.cos((s+1)/7*Math.PI*2)*r, rockH + d, rockY + Math.sin((s+1)/7*Math.PI*2)*r],
                    ],
                    hexColor.map((x) => x * 0.3 + 0.6),
                    "rock",
                );
            }
        }
    }
}

worldMesh.removeDoubledSurfaces();
    worldMesh.smoothAttribute("surface", "color", 0.01);
    worldMesh.smoothAttribute("surface", "normal", 0.01);
worldMesh.smoothAttribute("rock", "normal", 0.1);
let worldRendered = worldMesh.render();
// Now, we take the contents of the JS array and put them into the WebGL buffer.
// This is relatively slow: the biggest slowness in rendering is often sending
// information from the CPU to the GPU (TODO: explain this better).

// Now we have to create some buffers.
// Buffers are arrays that hold data that we want to send to the GPU.

// We create and bind a buffer here:
let triangleVertexBuffer = gl.createBuffer();
gl.bindBuffer(gl.ARRAY_BUFFER, triangleVertexBuffer);
// ARRAY_BUFFER means that it holds per-vertex data.
// Binding the buffer means that it's currently being modified.
// It will stay bound until we bind something else.
// Take a look at https://developer.mozilla.org/en-US/docs/Web/API/WebGLRenderingContext/bindBuffer for more information.
// Now we funnel the data from our array into the currently bound buffer.
// STATIC_DRAW indicates that we're not going to frequently modify the contents of the buffer.
// If you're going to do that, use DYNAMIC_DRAW instead. It will be faster.
gl.bufferData(gl.ARRAY_BUFFER, worldRendered.positions, gl.STATIC_DRAW);

let triangleColorBuffer = gl.createBuffer();
gl.bindBuffer(gl.ARRAY_BUFFER, triangleColorBuffer);
gl.bufferData(gl.ARRAY_BUFFER, worldRendered.colors, gl.STATIC_DRAW);

let triangleNormalBuffer = gl.createBuffer();
gl.bindBuffer(gl.ARRAY_BUFFER, triangleNormalBuffer);
gl.bufferData(gl.ARRAY_BUFFER, worldRendered.normals, gl.STATIC_DRAW);

// We're so close!

// Let's get a black background!
gl.clearColor(0, 0, 0, 1);

// Things behind other things shouldn't drawn. We don't have this yet, but we'll turn it on anyway.
gl.enable(gl.DEPTH_TEST);

// Set the size of the view:
canvas.width = 600; // TODO: explain about CSS here
canvas.height = 600;
gl.viewport(0, 0, 600, 600); // TODO: explain what this does

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
    // This says to clear both the color and depth buffers.
    gl.clear(gl.COLOR_BUFFER_BIT | gl.DEPTH_BUFFER_BIT);
    // We're going to bind our buffer again. We don't have to (it's still bound),
    // but in the future, we'll be binding more in between, so it's a good habit to put these together,
    // unless you're really trying to squeeze out performance.
    gl.bindBuffer(gl.ARRAY_BUFFER, triangleVertexBuffer);
    gl.vertexAttribPointer(vertexPositionAttribute, 3, gl.FLOAT, false, 0, 0);

    gl.bindBuffer(gl.ARRAY_BUFFER, triangleColorBuffer);
    gl.vertexAttribPointer(vertexColorAttribute, 3, gl.FLOAT, false, 0, 0);

    gl.bindBuffer(gl.ARRAY_BUFFER, triangleNormalBuffer);
    gl.vertexAttribPointer(vertexNormalAttribute, 3, gl.FLOAT, false, 0, 0);
    // The arguments are, in order:
    // * the attribute to modify (vertexPositionAttribute)
    // * the number of items in the array belonging to each vertex (3, it's a 3D point)
    // * the type of the contents (a floating point number)
    // * normalization: no effect when type is gl.FLOAT
    // * stride: size of gap between vertices (for when other data is stored in the buffer too)
    // * offset: location of first item in buffer (for when other data is stored in the buffer too)

    // set the perspective
    let near = 0.1;
    let far = 80;
    let cameraDistance = 10 / Math.pow(2, cameraZoom);
    let zoomScale = 2;
    gl.uniformMatrix4fv(perspectiveUniform, false, [
        zoomScale, 0, 0, 0,
        0, zoomScale, 0, 0,
        0, 0, (near+far) / (near-far), -1,
        0, 0, near*far/(near-far)*2, 0,
    ]);
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
    gl.uniformMatrix4fv(cameraUniform, false, [
        right[0], up[0], forward[0], 0,
        right[1], up[1], forward[1], 0,
        right[2], up[2], forward[2], 0,
        0, 0, 0, 1,
    ]);
    gl.uniform3f(lightingUniform, light[0], light[1], light[2]);
    gl.uniform1f(timeUniform, Date.now() / 1000 % 1000);
    gl.uniformMatrix4fv(cameraPositionUniform, false, [
        1, 0, 0, 0,
        0, 1, 0, 0,
        0, 0, 1, 0,
        -from[0], -from[1], -from[2], 1,
    ]);
    gl.drawArrays(gl.TRIANGLES, 0, worldMesh.count() * 3);
}

loop();

function humanize(variable: string): string {
    return variable.split(/(?=[A-Z])/).join(" ").toLowerCase();
}
