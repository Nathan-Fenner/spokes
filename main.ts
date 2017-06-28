
let canvas = document.getElementById("canvas") as HTMLCanvasElement;
canvas.width = 900;
canvas.height = 600;

let globalOptions = {
    politicalMap: false,
};

// build a hex grid

function randomChoose<T>(xs: T[]): T {
    return xs[Math.random() * xs.length|0];
}

type HexPos = {hx: number, hy: number};
type WorldPos = {wx: number, wy: number};

function hexToSnappedWorld(pos: {hx: number, hy: number}, scale: number) {
    // scale = scale | 0;
    if (scale % 2 != 0) {
        // scale++;
    }
    let col = pos.hx;
    let row = pos.hy + pos.hx;

    row -= col * 1.5;
    
    return {wx: col * (scale) | 0, wy: row * (scale) | 0};
}

function hexToWorld(pos: {hx: number, hy: number}) {
    // TODO: we can make this much nicer, if we ask for the scale
    let {hx, hy} = pos;
    return {wx: hx * 7/8, wy: hx*1/2 - hy*Math.sqrt(3)/2};
}

function hexKey(cell: HexPos): string {
    return cell.hx + "H" + cell.hy;
}

function hexNeighbors(p: HexPos): HexPos[] {
    let result = [];
    for (let {dx, dy} of [{dx: 1, dy: 0}, {dx: 1, dy: 1}, {dx: 0, dy: 1}, {dx: -1, dy: 0}, {dx: -1, dy: -1}, {dx: 0, dy: -1}]) {
        result.push({hx: p.hx + dx, hy: p.hy + dy});
    }
    return result
}

function hexCorners(p: HexPos): WorldPos[] {
    let ns = hexNeighbors(p);
    let rs: WorldPos[] = [];
    for (let i = 0; i < 6; i++) {
        let {wx: cx, wy: cy} = hexToWorld(p);
        let {wx: ax, wy: ay} = hexToWorld(ns[i]);
        let {wx: bx, wy: by} = hexToWorld(ns[(i+1)%6]);
        rs[i] = {wx: (ax+bx+cx)/3, wy: (ay+by+cy)/3};
    }
    return rs;
}

function hexOffset(p: HexPos, d1: number, d2: number): HexPos {
    return { hx: p.hx + d1, hy: p.hy + d2 };
}

function hexDistance(p: HexPos, q: HexPos): number {
    if (p.hx == q.hx || p.hy == q.hy) {
        return Math.abs(p.hx - q.hx) + Math.abs(p.hy - q.hy);
    }
    if ((p.hx - q.hx < 0) == (p.hy - q.hy < 0)) {
        return Math.max(Math.abs(p.hx - q.hx), Math.abs(p.hy - q.hy));
    }
    return Math.abs(p.hx - q.hx) + Math.abs(p.hy - q.hy);
}

// world generation
// randomly grow a mass
let mass: HexPos[] = [{hx: 0, hy: 0}];
let massSet: {[k: string]: boolean} = {[hexKey(mass[0])]: true};
type Avoider = HexPos & {r: number};
let avoiders: Avoider[] = [];

let avoiderCount = Math.random() * 200;
for (let i = 0; i < avoiderCount; i++) {
    avoiders.push({
        hx: Math.random() * 100 - 50,
        hy: Math.random() * 100 - 50,
        r: Math.random() * 5 + 2,
    });
}

while (mass.length < 1000) {
    let from = mass[Math.random()*mass.length|0];
    let neighbor = hexNeighbors(from)[Math.random()*6|0];
    let signature = hexKey(neighbor);
    if (signature in massSet) {
        continue;
    }
    let reject = 0;
    for (let avoider of avoiders) {
        reject = Math.max(reject, avoider.r - 2 * hexDistance(neighbor, avoider) ** 0.5);
    }
    // 0.9 is the fuzziness parameter.
    // if it's higher, borders become sharper but more regular
    // if it's much lower, borders completely disappear
    if (Math.random() < 0.9 && Math.random() < reject) {
        continue;
    }
    mass.push(neighbor);
    massSet[signature] = true;
}

// the landmass has been made

// divide it into territories

let territorySize = 30;
let territoryCount = mass.length/territorySize + 1 | 0;

type Territory = {
    id: string,
    cells: HexPos[],
    color: string,
};

let territories: Territory[] = [];
let territoryMap: {[k: string]: Territory} = {};

for (let cell of mass) {
    territoryMap[hexKey(cell)] = {
        id: hexKey(cell),
        cells: [cell],
        color: randomChoose(["#083", "#093", "#007B33", "#A94", "#983", "#AAC"]),
    };
    territories.push(territoryMap[hexKey(cell)]);
}

while (territories.length > territoryCount) {
    // find the smallest territory
    let smallest = 0;
    for (let i = 0; i < territories.length; i++) {
        if (territories[i].cells.length < territories[smallest].cells.length) {
            smallest = i;
        }
    }
    let smallestTerritory = territories[smallest];
    territories[smallest] = territories[territories.length-1];
    territories.pop();
    // find neighboring territory
    let neighboringTerritory: Territory | null = null;
    while (neighboringTerritory == null) {
        let contained = randomChoose(smallestTerritory.cells);
        let neighbor = randomChoose(hexNeighbors(contained));
        if (territoryMap[hexKey(neighbor)] && territoryMap[hexKey(neighbor)] != smallestTerritory) {
            neighboringTerritory = territoryMap[hexKey(neighbor)];
        }
    }
    // merge the two
    for (let cell of smallestTerritory.cells) {
        territoryMap[hexKey(cell)] = neighboringTerritory;
        neighboringTerritory.cells.push(cell);
    }
}


// suppose we just merged adjacent nations of the same color
// this would lead to interesting variations in size and shape, and simplify border presentation

for (let p of mass) {
    for (let n of hexNeighbors(p)) {
        if (hexKey(n) in territoryMap && territoryMap[hexKey(n)] != territoryMap[hexKey(p)] && territoryMap[hexKey(p)].color == territoryMap[hexKey(n)].color) {
            // merge the territories
            let original = territoryMap[hexKey(p)];
            let merged = territoryMap[hexKey(n)];
            for (let q of mass) {
                if (territoryMap[hexKey(q)] == merged) {
                    territoryMap[hexKey(q)] = original;
                    original.cells.push(q);
                }
            }
        }
    }
}

// with overwhelming likelihood, there are at least two nations.
// we can ignore the case where this is not true (for now; I want to handle it eventually)

type Nation = {
    cells: HexPos[],
    color: string,
    colorRGB: [number, number, number],
    capitol: HexPos,
};

let usedTerritories: Territory[] = [];
let nations: Nation[] = [];
let nationMap: {[k: string]: Nation} = {};
for (let p of mass) {
    let territory = territoryMap[hexKey(p)];
    if (usedTerritories.indexOf(territory) == -1) {
        usedTerritories.push(territory);
        let capitol = territory.cells[Math.random() * territory.cells.length | 0];
        let color = randomChoose(["#F00", "#FF0", "#00F"]);
        let nonBorder = territory.cells.filter((p) => {
            for (let n of hexNeighbors(p)) {
                if (hexKey(n) in massSet) {
                    if (territoryMap[hexKey(n)] != territoryMap[hexKey(p)]) {
                        return false;
                    }
                }
            }
            return true;
        });
        if (nonBorder.length > 0) {
            capitol = nonBorder[Math.random() * nonBorder.length | 0];
        }
        let nation: Nation = {
            cells: territory.cells,
            color,
            capitol,
            colorRGB: [Math.random(), Math.random(), Math.random()],
        };
        nations.push(nation);
        for (let cell of territory.cells) {
            nationMap[hexKey(cell)] = nation;
        }
    }
}

// nations have an owner (which is a player)

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

let triangles = 10000;

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

varying vec3 fragmentPosition;
varying vec3 fragmentColor;

void main(void) {
    gl_Position = perspective * camera * cameraPosition * vec4(vertexPosition, 1.0);
    fragmentPosition = vertexPosition;
    fragmentColor = vertexColor;
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

varying vec3 fragmentPosition;
varying vec3 fragmentColor;

float random( vec3 p )
{
    vec3 r = vec3(23.14069263277926,2.665144142690225, -1.4583722432222111 );
    return fract( cos( mod( 12345678., 256. * dot(p,r) ) ) + cos( mod( 87654321., 256. * dot(p.zyx,r) ) ) );
}

void main(void) {
    float y = min(1.0, max(0.0, 0.4 - fragmentPosition.y * 0.25));
    float noise = random(floor(15.0 * fragmentPosition));
    gl_FragColor = vec4(y * fragmentColor - noise * 0.025, 1.0);
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

// get the perspective uniform
let perspectiveUniform = gl.getUniformLocation(shaderProgram, "perspective")!;
let cameraPositionUniform = gl.getUniformLocation(shaderProgram, "cameraPosition")!;
let cameraUniform = gl.getUniformLocation(shaderProgram, "camera")!;
let timeUniform = gl.getUniformLocation(shaderProgram, "time")!;


let massHeight: {[k: string]: number} = {};
massHeight[hexKey({hx: 0, hy: 0})] = 2;

type HexTile = HexPos & "ReallyTile";

function isTile(h: HexPos): h is HexTile {
    return hexKey(h) in massHeight;
}

function heightOf(h: HexTile): number {
    return massHeight[hexKey(h)];
}

while (1) {
    let unassigned: {p: HexPos, v: number}[] = [];
    for (let p of mass) {
        if (hexKey(p) in massHeight) {
            continue;
        }
        for (let n of hexNeighbors(p)) {
            if (hexKey(n) in massHeight) {
                unassigned.push({p, v: massHeight[hexKey(n)]});
            }
        }
    }
    if (unassigned.length == 0) {
        break;
    }
    let choice = randomChoose(unassigned);
    massHeight[hexKey(choice.p)] = Math.max(0, Math.min(8, choice.v + randomChoose([0, 0, -1, 1])));
}
// Great! We're getting there.

let tiles: HexTile[] = [];
for (let p of mass) {
    tiles.push(p as HexTile);
}

// Now, let's create the vertices for our triangle, and send them to the GPU.

function range(xs: number[]): number {
    return Math.max(...xs) - Math.min(...xs);
}
function middle(xs: number[]): number {
    return (Math.max(...xs) + Math.min(...xs)) / 2;
}
function distinct<A>(xs: A[]): boolean {
    for (let i = 0; i < xs.length; i++) {
        for (let j = 0; j < i; j++) {
            if (xs[i] == xs[j]) {
                return false;
            }
        }
    }
    return true;
}

function cornerHeightCombine(self: number, hs: number[]): number {
    if (range([self, ...hs]) == 1) {
        return middle([self, ...hs]);
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
let triangleVertexArray: number[] = [];
let triangleColorArray: number[] = [];
for (let p of tiles) {
    let cs = hexCorners(p);
    let bladeCount = 30 * randomChoose([0, 0, 0, 1, 1/8, 1/8, 1/20]);
    let corners: {point: WorldPos, height: number}[] = [];
    let neighbors = hexNeighbors(p);
    for (let i = 0; i < 6; i++) {
        let n1 = neighbors[i];
        let n2 = neighbors[(i+1)%6];
        let pos1 = hexToWorld(p);
        let pos2 = hexToWorld(n1);
        let pos3 = hexToWorld(n2);
        let point = {wx: (pos1.wx + pos2.wx + pos3.wx)/3, wy: (pos1.wy + pos2.wy + pos3.wy)/3};
        let hs: number[] = [];
        if (isTile(n1)) {
            hs.push(heightOf(n1));
        }
        if (isTile(n2)) {
            hs.push(heightOf(n2));
        }
        let height = cornerHeightCombine(heightOf(p), hs);
        corners.push({point, height});
    }
    for (let i = 0; i < 6; i++) {
        let {wx, wy} = hexToWorld(p);
        let {wx: ax, wy: ay} = corners[i].point; // cs[i];
        let {wx: bx, wy: by} = corners[(i+1)%6].point;

        let reheight = (h: number) => -h * 0.25;

        let mainHeight = reheight(heightOf(p));
        let cornerAHeight = reheight(corners[i].height);
        let cornerBHeight = reheight(corners[(i+1)%6].height);
        triangleVertexArray.push(wx, mainHeight, wy);
        triangleVertexArray.push(ax, cornerAHeight, ay);
        triangleVertexArray.push(bx, cornerBHeight, by);

        let hexColor = [0.9, 0.65, 0.35];
        hexColor = hexColor.map((x) => x * (heightOf(p) / 5 * 0.5 + 0.5));
        let sideShadow = 0.4;
        let grassColor = [0.1, 0.56, 0.2];

        for (let j = 0; j < 3; j++) {
            triangleColorArray.push(hexColor[0], hexColor[1], hexColor[2]);
        }

        triangleVertexArray.push(ax, cornerAHeight, ay);
        triangleVertexArray.push(bx, cornerBHeight, by);
        triangleVertexArray.push(bx, 8, by);

        
        for (let j = 0; j < 3; j++) {
            triangleColorArray.push(hexColor[0]*sideShadow, hexColor[1]*sideShadow, hexColor[2]*sideShadow);
        }

        
        triangleVertexArray.push(ax, cornerAHeight, ay);
        triangleVertexArray.push(bx, 8, by);
        triangleVertexArray.push(ax, 8, ay);

        
        for (let j = 0; j < 3; j++) {
            triangleColorArray.push(hexColor[0]*sideShadow, hexColor[1]*sideShadow, hexColor[2]*sideShadow);
        }
    }
}
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
gl.bufferData(gl.ARRAY_BUFFER, new Float32Array(triangleVertexArray), gl.STATIC_DRAW);

let triangleColorBuffer = gl.createBuffer();
gl.bindBuffer(gl.ARRAY_BUFFER, triangleColorBuffer);
gl.bufferData(gl.ARRAY_BUFFER, new Float32Array(triangleColorArray), gl.STATIC_DRAW);

// We're so close!

// Let's get a black background!
gl.clearColor(0, 0, 0, 1);

// Things behind other things shouldn't drawn. We don't have this yet, but we'll turn it on anyway.
gl.enable(gl.DEPTH_TEST);

// Set the size of the view:
canvas.width = 600; // TODO: explain about CSS here
canvas.height = 600;
gl.viewport(0, 0, 600, 600); // TODO: explain what this does

type Vec3 = [number, number, number];
type Mat4 = [
    number, number, number, number,
    number, number, number, number,
    number, number, number, number,
    number, number, number, number
];

function normalizeSet(vec: Vec3) {
    let mag = Math.sqrt(vec[0]*vec[0] + vec[1]*vec[1] + vec[2]*vec[2]);
    vec[0] /= mag;
    vec[1] /= mag;
    vec[2] /= mag;
}

function cross(u: Vec3, v: Vec3): Vec3 {
    return [u[1]*v[2] - u[2]*v[1], u[2]*v[0] - u[0]*v[2], u[0]*v[1] - u[1]*v[0]];
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
let cameraZoom = 1;
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
        cameraZoom = Math.max(-1, Math.min(4, cameraZoom));
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
        cameraZoom = Math.max(-1, Math.min(4, cameraZoom));
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

let shift = Math.PI / 2;
// Now, we get ready to draw our triangle:
function loop() {
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
    let zoomScale = Math.pow(2, cameraZoom);
    gl.uniformMatrix4fv(perspectiveUniform, false, [
        zoomScale, 0, 0, 0,
        0, zoomScale, 0, 0,
        0, 0, (near+far) / (near-far), -1,
        0, 0, near*far/(near-far)*2, 0,
    ]);
    let t = Date.now() / 1000 / 10;

    let from = [
        Math.cos(cameraViewAngle) * 20,
        -10,
        Math.sin(cameraViewAngle) * 20,
    ];
    let to = [
        0,
        0,
        0,
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
    gl.uniform1f(timeUniform, Date.now() / 1000 % 1000);
    gl.uniformMatrix4fv(cameraPositionUniform, false, [
        1, 0, 0, 0,
        0, 1, 0, 0,
        0, 0, 1, 0,
        -from[0], -from[1], -from[2], 1,
    ]);

    // Let's draw the triangle!
    // We tell WebGL to draw our triangle(s).
    // TRIANGLES means that the attributes are grouped into [A1, B1, C1, A2, B2, C2, A3, B3, C3, ...]
    // where Ai, Bi, Ci are the three vertices of each triangle.
    // The other options are:
    // * 
    // * 
    gl.drawArrays(gl.TRIANGLES, 0, triangleVertexArray.length / 9);
}
loop();


/*
let scale = 12;
let size = (scale * 0.876) | 0;

function fillHexCell(pos: HexPos, resize = 1) {
    let d = hexToSnappedWorld(pos, scale);
    let drawSize = Math.ceil(scale*resize);
    ctx.fillRect(canvas.width/2 + d.wx - drawSize/2 | 0, canvas.height/2 + d.wy - drawSize/2 | 0, drawSize, drawSize);
}

function drawWorld() {
    ctx.clearRect(0, 0, canvas.width, canvas.height);

    ctx.fillStyle = "#257";
    ctx.fillRect(0, 0, canvas.width, canvas.height);
    let stripeHeight = 6;
    for (let stripe = 0; stripe < canvas.height; stripe += stripeHeight*2) {
        ctx.fillStyle = "#194969";
        ctx.fillRect(0, stripe, canvas.width, stripeHeight);
    }

    for (let p of mass) {
        ctx.fillStyle = territoryMap[hexKey(p)].color;
        fillHexCell(p);
    }

    if (globalOptions.politicalMap) {
        for (let p of mass) {
            ctx.fillStyle = nationMap[hexKey(p)].color;
            fillHexCell(p, 0.36);
        }
    }
    for (let nation of nations) {
        ctx.fillStyle = "#FFF";
        fillHexCell(nation.capitol, 1.2);
        ctx.fillStyle = nation.color;
        fillHexCell(nation.capitol, 0.9);

        // ctx.fillStyle = "#F00";
        // fillHexCell(hexOffset(nation.capitol, 1, 0), 0.5);
        // ctx.fillStyle = "#FF0";
        // fillHexCell(hexOffset(nation.capitol, 1, 1), 0.5);
        // ctx.fillStyle = "#00F";
        // fillHexCell(hexOffset(nation.capitol, 0, 1), 0.5);
    }
    window.requestAnimationFrame(drawWorld);
}

drawWorld();
*/

