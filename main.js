var canvas = document.getElementById("canvas");
canvas.width = 900;
canvas.height = 600;
var generationParameters = {
    avoiderCount: Math.random() * 200 | 0,
    tileCount: Math.random() * 500 + 750 | 0,
    smoothness: Math.pow(Math.random(), 2) * 60
};
// generation parameters (TODO: expose this in the UI)
function randomChoose(xs) {
    return xs[Math.random() * xs.length | 0];
}
function clamp(low, value, high) {
    return Math.min(high, Math.max(low, value));
}
function hexToWorld(pos) {
    var hx = pos.hx, hy = pos.hy;
    return { wx: hx + hy * Math.cos(Math.PI * 2 / 3), wy: hy * Math.sin(Math.PI * 2 / 3) };
}
function hexKey(cell) {
    return cell.hx + "H" + cell.hy;
}
function hexNeighbors(p) {
    var result = [];
    for (var _i = 0, _a = [{ dx: 1, dy: 0 }, { dx: 1, dy: 1 }, { dx: 0, dy: 1 }, { dx: -1, dy: 0 }, { dx: -1, dy: -1 }, { dx: 0, dy: -1 }]; _i < _a.length; _i++) {
        var _b = _a[_i], dx = _b.dx, dy = _b.dy;
        result.push({ hx: p.hx + dx, hy: p.hy + dy });
    }
    return result;
}
function hexCorners(p) {
    var ns = hexNeighbors(p);
    var rs = [];
    for (var i = 0; i < 6; i++) {
        var _a = hexToWorld(p), cx = _a.wx, cy = _a.wy;
        var _b = hexToWorld(ns[i]), ax = _b.wx, ay = _b.wy;
        var _c = hexToWorld(ns[(i + 1) % 6]), bx = _c.wx, by = _c.wy;
        rs[i] = { wx: (ax + bx + cx) / 3, wy: (ay + by + cy) / 3 };
    }
    return rs;
}
function hexDistance(p, q) {
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
var mass = [{ hx: 0, hy: 0 }];
var massSet = (_a = {}, _a[hexKey(mass[0])] = true, _a);
var avoiders = [];
for (var i = 0; i < generationParameters.avoiderCount; i++) {
    avoiders.push({
        hx: Math.random() * 100 - 50,
        hy: Math.random() * 100 - 50,
        r: Math.random() * 5 + 2
    });
}
while (mass.length < generationParameters.tileCount) {
    var from = randomChoose(mass);
    var neighbor = randomChoose(hexNeighbors(from));
    var signature = hexKey(neighbor);
    if (signature in massSet) {
        continue;
    }
    var reject = 0;
    for (var _i = 0, avoiders_1 = avoiders; _i < avoiders_1.length; _i++) {
        var avoider = avoiders_1[_i];
        reject = Math.max(reject, avoider.r - 2 * Math.pow(hexDistance(neighbor, avoider), 0.5));
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
var territorySize = 30;
var territoryCount = mass.length / territorySize + 1 | 0;
// TODO: use height to determine territories
var territories = [];
var territoryMap = {};
for (var _b = 0, mass_1 = mass; _b < mass_1.length; _b++) {
    var cell = mass_1[_b];
    territoryMap[hexKey(cell)] = {
        id: hexKey(cell),
        cells: [cell],
        color: randomChoose(["#083", "#093", "#007B33", "#A94", "#983", "#AAC"])
    };
    territories.push(territoryMap[hexKey(cell)]);
}
while (territories.length > territoryCount) {
    // find the smallest territory
    var smallest = 0;
    for (var i = 0; i < territories.length; i++) {
        if (territories[i].cells.length < territories[smallest].cells.length) {
            smallest = i;
        }
    }
    var smallestTerritory = territories[smallest];
    territories[smallest] = territories[territories.length - 1];
    territories.pop();
    // find neighboring territory
    var neighboringTerritory = null;
    while (neighboringTerritory == null) {
        var contained = randomChoose(smallestTerritory.cells);
        var neighbor = randomChoose(hexNeighbors(contained));
        if (territoryMap[hexKey(neighbor)] && territoryMap[hexKey(neighbor)] != smallestTerritory) {
            neighboringTerritory = territoryMap[hexKey(neighbor)];
        }
    }
    // merge the two
    for (var _c = 0, _d = smallestTerritory.cells; _c < _d.length; _c++) {
        var cell = _d[_c];
        territoryMap[hexKey(cell)] = neighboringTerritory;
        neighboringTerritory.cells.push(cell);
    }
}
// suppose we just merged adjacent nations of the same color
// this would lead to interesting variations in size and shape, and simplify border presentation
for (var _e = 0, mass_2 = mass; _e < mass_2.length; _e++) {
    var p = mass_2[_e];
    for (var _f = 0, _g = hexNeighbors(p); _f < _g.length; _f++) {
        var n = _g[_f];
        if (hexKey(n) in territoryMap && territoryMap[hexKey(n)] != territoryMap[hexKey(p)] && territoryMap[hexKey(p)].color == territoryMap[hexKey(n)].color) {
            // merge the territories
            var original = territoryMap[hexKey(p)];
            var merged = territoryMap[hexKey(n)];
            for (var _h = 0, mass_3 = mass; _h < mass_3.length; _h++) {
                var q = mass_3[_h];
                if (territoryMap[hexKey(q)] == merged) {
                    territoryMap[hexKey(q)] = original;
                    original.cells.push(q);
                }
            }
        }
    }
}
var usedTerritories = [];
var nations = [];
var nationMap = {};
for (var _j = 0, mass_4 = mass; _j < mass_4.length; _j++) {
    var p = mass_4[_j];
    var territory = territoryMap[hexKey(p)];
    if (usedTerritories.indexOf(territory) == -1) {
        usedTerritories.push(territory);
        var capitol = territory.cells[Math.random() * territory.cells.length | 0];
        var color = randomChoose(["#F00", "#FF0", "#00F"]);
        var nonBorder = territory.cells.filter(function (p) {
            for (var _i = 0, _a = hexNeighbors(p); _i < _a.length; _i++) {
                var n = _a[_i];
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
        var nation = {
            cells: territory.cells,
            color: color,
            capitol: capitol,
            colorRGB: [Math.random(), Math.random(), Math.random()]
        };
        nations.push(nation);
        for (var _k = 0, _l = territory.cells; _k < _l.length; _k++) {
            var cell = _l[_k];
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
var tryGL = canvas.getContext("webgl");
if (!tryGL) {
    throw "unable to get webGL context";
}
var gl = tryGL;
// We're going to make a basic program to start.
// We'll just have a triangle.
// To do this, we have to introduce our first GL concept: shaders.
// A "shader" is a program that runs on the GPU. The language that WebGL uses
// is called GLSL. It looks something like C, though it's a lot simpler.
// This is a modern (i.e. ES2016) feature called template literals.
// It's basically a multiline string.
var vertexShaderSource = "\nprecision mediump float;\nuniform mat4 perspective;\nuniform mat4 cameraPosition;\nuniform mat4 camera;\n\nattribute vec3 vertexPosition;\nattribute vec3 vertexColor;\nattribute vec3 vertexNormal;\n\nvarying vec3 fragmentPosition;\nvarying vec3 fragmentColor;\nvarying vec3 fragmentNormal;\n\nvoid main(void) {\n    gl_Position = perspective * camera * cameraPosition * vec4(vertexPosition, 1.0);\n    fragmentPosition = vertexPosition;\n    fragmentColor = vertexColor;\n    fragmentNormal = vertexNormal;\n}\n";
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
var fragmentShaderSource = "\nprecision mediump float;\n\nuniform float time;\nuniform vec3 lightDirection;\n\nvarying vec3 fragmentPosition;\nvarying vec3 fragmentColor;\nvarying vec3 fragmentNormal;\n\nfloat random( vec3 p )\n{\n    vec3 r = vec3(2.314069263277926,2.665144142690225, -1.4583722432222111 );\n    return fract( cos( mod( 12345678., 256. * dot(p,r) ) ) + cos( mod( 87654321., 256. * dot(p.zyx,r) ) ) );\n}\nfloat smoothNoise( vec2 p ) {\n    vec3 f = vec3(floor(p), 1.0);\n    float f0 = mix( random(f + vec3(0.0, 0.0, 0.0)), random(f + vec3(1.0, 0.0, 0.0)), fract(p.x) );\n    float f1 = mix( random(f + vec3(0.0, 1.0, 0.0)), random(f + vec3(1.0, 1.0, 0.0)), fract(p.x) );\n    return mix( f0, f1, fract(p.y) );\n}\nfloat cloudNoise( vec2 x, float f, float a ) {\n    float s = 0.0;\n    for (int i = 0; i < 5; i++) {\n        vec2 arg = x * pow(f, float(i));\n        s += smoothNoise(arg) * pow(a, float(i));\n    }\n    return s * (1.0 - a);\n}\n\nvoid main(void) {\n    float y = min(1.0, max(0.0, 0.6 - fragmentPosition.y * 0.2));\n    float noise = random(floor(15.0 * fragmentPosition));\n    float lambert = dot(normalize(fragmentNormal), normalize(lightDirection)) * 0.35 + 0.65;\n    gl_FragColor = vec4(lambert * y * fragmentColor, 1.0);\n    float originalHeight = fragmentPosition.y * -4.0;\n    float n = cloudNoise(fragmentPosition.xz, 2.0, 0.5);\n    if (fract(originalHeight - 0.4 + (n-0.5)*0.8) < 0.2 && gl_FragColor.g > gl_FragColor.r * 1.3) {\n        // gl_FragColor.rgb *= 0.75;\n    }\n}\n";
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
var vertexShader = gl.createShader(gl.VERTEX_SHADER);
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
var fragmentShader = gl.createShader(gl.FRAGMENT_SHADER);
gl.shaderSource(fragmentShader, fragmentShaderSource);
gl.compileShader(fragmentShader);
if (!gl.getShaderParameter(fragmentShader, gl.COMPILE_STATUS)) {
    console.log(gl.getShaderInfoLog(fragmentShader));
    throw "error loading fragment shader";
}
// Next, we combine the two shaders into a `Program`.
// The Program is what's actually run on the GPU.
var shaderProgram = gl.createProgram();
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
var vertexPositionAttribute = gl.getAttribLocation(shaderProgram, "vertexPosition");
// We also have to turn it on:
gl.enableVertexAttribArray(vertexPositionAttribute);
var vertexColorAttribute = gl.getAttribLocation(shaderProgram, "vertexColor");
gl.enableVertexAttribArray(vertexColorAttribute);
var vertexNormalAttribute = gl.getAttribLocation(shaderProgram, "vertexNormal");
gl.enableVertexAttribArray(vertexNormalAttribute);
// get the perspective uniform
var perspectiveUniform = gl.getUniformLocation(shaderProgram, "perspective");
var cameraPositionUniform = gl.getUniformLocation(shaderProgram, "cameraPosition");
var cameraUniform = gl.getUniformLocation(shaderProgram, "camera");
var timeUniform = gl.getUniformLocation(shaderProgram, "time");
var lightingUniform = gl.getUniformLocation(shaderProgram, "lightDirection");
var light = [2, -2, 2];
var massHeight = {};
massHeight[hexKey({ hx: 0, hy: 0 })] = 2;
function isTile(h) {
    return hexKey(h) in massHeight;
}
function heightOf(h) {
    return massHeight[hexKey(h)];
}
while (1) {
    var unassigned = [];
    for (var _m = 0, mass_5 = mass; _m < mass_5.length; _m++) {
        var p = mass_5[_m];
        if (hexKey(p) in massHeight) {
            continue;
        }
        for (var _o = 0, _p = hexNeighbors(p); _o < _p.length; _o++) {
            var n = _p[_o];
            if (hexKey(n) in massHeight) {
                unassigned.push({ p: p, v: massHeight[hexKey(n)] });
            }
        }
    }
    if (unassigned.length == 0) {
        break;
    }
    var choice = randomChoose(unassigned);
    massHeight[hexKey(choice.p)] = clamp(0, choice.v + (Math.random() * 100 < generationParameters.smoothness ? 0 : randomChoose([1, -1])), 8);
}
// Great! We're getting there.
var tiles = [];
for (var _q = 0, mass_6 = mass; _q < mass_6.length; _q++) {
    var p = mass_6[_q];
    tiles.push(p);
}
// Now, we smooth the result to eliminate areas of varying height with no strategic value.
for (var i = 0; i < 10; i++) {
    var _loop_1 = function (j) {
        var tile = tiles[j];
        var h = heightOf(tile);
        var forbid = [];
        var neighbor = [];
        for (var _i = 0, _a = hexNeighbors(tile); _i < _a.length; _i++) {
            var n = _a[_i];
            if (isTile(n) && Math.abs(heightOf(n) - h) <= 2) {
                neighbor.push(heightOf(n));
            }
        }
        var countH0 = neighbor.filter(function (x) { return x == h; }).length;
        var countHU = neighbor.filter(function (x) { return x == h + 1; }).length;
        var countHD = neighbor.filter(function (x) { return x == h - 1; }).length;
        // this may create new connections, but it won't destroy existing ones
        if (neighbor.indexOf(h + 1) < 0 && countHD > countH0) {
            massHeight[hexKey(tile)] = h - 1;
        }
        if (neighbor.indexOf(h - 1) < 0 && countHU > countH0) {
            massHeight[hexKey(tile)] = h + 1;
        }
    };
    for (var j = 0; j < tiles.length; j++) {
        _loop_1(j);
    }
}
// Now, let's create the vertices for our triangle, and send them to the GPU.
function range(xs) {
    return Math.max.apply(Math, xs) - Math.min.apply(Math, xs);
}
function middle(xs) {
    return (Math.max.apply(Math, xs) + Math.min.apply(Math, xs)) / 2;
}
function median(xs) {
    var ys = xs.slice(0).sort();
    if (ys.length % 2 == 0) {
        return (ys[ys.length / 2 - 1] + ys[ys.length / 2]) / 2;
    }
    return ys[ys.length / 2 | 0];
}
function distinct(xs) {
    for (var i = 0; i < xs.length; i++) {
        for (var j = 0; j < i; j++) {
            if (xs[i] == xs[j]) {
                return false;
            }
        }
    }
    return true;
}
function cornerHeightCombine(self, hs) {
    if (range([self].concat(hs)) == 1) {
        return median([self].concat(hs));
    }
    if (hs.length == 2 && range([self].concat(hs)) == 2 && distinct([self].concat(hs))) {
        return middle([self].concat(hs));
    }
    if (hs.length == 2 && hs.filter(function (x) { return Math.abs(x - self) <= 1; }).length == 2) {
        return middle([self].concat(hs));
    }
    if (hs.length == 2) {
        var nearby = hs.filter(function (x) { return Math.abs(x - self) <= 1; });
        return cornerHeightCombine(self, nearby);
    }
    return self;
}
function cross(u, v) {
    return [u[1] * v[2] - u[2] * v[1], u[2] * v[0] - u[0] * v[2], u[0] * v[1] - u[1] * v[0]];
}
function subtract(u, v) {
    return [u[0] - v[0], u[1] - v[1], u[2] - v[2]];
}
function add() {
    var us = [];
    for (var _i = 0; _i < arguments.length; _i++) {
        us[_i] = arguments[_i];
    }
    var sum = [0, 0, 0];
    for (var _a = 0, us_1 = us; _a < us_1.length; _a++) {
        var u = us_1[_a];
        sum[0] += u[0];
        sum[1] += u[1];
        sum[2] += u[2];
    }
    return sum;
}
function plus(u, v) {
    return add(u, v);
}
function scale(k, v) {
    return [k * v[0], k * v[1], k * v[2]];
}
function dot(a, b) {
    var s = 0;
    s += a[0] * b[0];
    s += a[1] * b[1];
    s += a[2] * b[2];
    return s;
}
function magnitude(v) {
    return Math.sqrt(Math.pow(v[0], 2) + Math.pow(v[1], 2) + Math.pow(v[2], 2));
}
function distance(v, u) {
    return magnitude(subtract(v, u));
}
function unit(v) {
    return scale(1 / magnitude(v), v);
}
function compressPath(path) {
    return path.replace(/LL/g, "A").replace(/RR/g, "B").replace(/LR/g, "C").replace(/RL/g, "D");
}
var PointSet = (function () {
    function PointSet() {
        this.levels = { dimension: 0, next: null };
    }
    PointSet.prototype.find = function (p, eps) {
        var signature = "";
        var roots = [{ root: this.levels, path: "_" }];
        while (roots.length > 0) {
            var _a = roots.pop(), root = _a.root, path = _a.path;
            var next = root.next;
            if (!next) {
                continue; // nothing to do
            }
            if (distance(next.pivot, p) < eps) {
                return { path: compressPath(path), value: next.value };
            }
            if (p[root.dimension] < next.pivot[root.dimension] + eps) {
                roots.push({ root: next.low, path: path + "L" });
            }
            if (p[root.dimension] > next.pivot[root.dimension] - eps) {
                roots.push({ root: next.high, path: path + "H" });
            }
        }
        return null;
    };
    PointSet.prototype.insertInto = function (p, root, v, eps) {
        var dimensions = [0, 1, 2];
        if (root.next) {
            if (distance(p, root.next.pivot) < eps) {
                throw "bad behavior: do not insert point with nearby neighbor";
            }
            if (p[root.dimension] < root.next.pivot[root.dimension]) {
                this.insertInto(p, root.next.low, v, eps);
            }
            else {
                this.insertInto(p, root.next.high, v, eps);
            }
        }
        else {
            root.next = {
                pivot: p,
                value: v,
                low: { dimension: randomChoose(dimensions), next: null },
                high: { dimension: randomChoose(dimensions), next: null }
            };
        }
    };
    PointSet.prototype.insertPoints = function (ps, eps) {
        var qs = ps.slice(0);
        for (var i = 0; i < qs.length; i++) {
            var j = i + Math.random() * (qs.length - i) | 0;
            var a = qs[i];
            var b = qs[j];
            qs[i] = b;
            qs[j] = a;
        }
        for (var _i = 0, qs_1 = qs; _i < qs_1.length; _i++) {
            var _a = qs_1[_i], p = _a.p, v = _a.v;
            if (!this.find(p, eps)) {
                this.insertInto(p, this.levels, v, eps);
            }
        }
    };
    return PointSet;
}());
var attributeCombiner = {
    normal: function (list) { return unit(list.reduce(plus, [0, 0, 0])); },
    color: function (list) { return scale(1 / list.length, list.reduce(plus, [0, 0, 0])); }
};
var Mesh = (function () {
    function Mesh() {
        this.triangles = [];
    }
    Mesh.prototype.count = function () {
        return this.triangles.length;
    };
    Mesh.prototype.addGeneral = function (vertices) {
        this.triangles.push({ vertices: vertices });
    };
    Mesh.prototype.addSingleColor = function (positions, color, smoothingGroup) {
        // note that orientation matters to determine normal
        var normal = unit(cross(subtract(positions[1], positions[0]), subtract(positions[2], positions[0])));
        this.triangles.push({
            vertices: [
                { position: positions[0], color: color, normal: normal },
                { position: positions[1], color: color, normal: normal },
                { position: positions[2], color: color, normal: normal },
            ],
            smoothingGroup: smoothingGroup
        });
    };
    Mesh.prototype.removeDoubledSurfaces = function () {
        var EPS = 0.001;
        var allPoints = [];
        for (var _i = 0, _a = this.triangles; _i < _a.length; _i++) {
            var triangle = _a[_i];
            allPoints.push.apply(allPoints, triangle.vertices.map(function (x) { return ({ p: x.position, v: null }); }));
        }
        var tree = new PointSet();
        tree.insertPoints(allPoints, EPS);
        function describeVertex(vertex) {
            var result = tree.find(vertex.position, EPS);
            if (result) {
                return result.path;
            }
            window.blub = tree;
            window.flub = vertex.position;
            throw "invalid";
        }
        function describe(triangle) {
            return triangle.vertices.map(describeVertex).sort().join(":");
        }
        var triangleCount = {};
        for (var _b = 0, _c = this.triangles; _b < _c.length; _b++) {
            var triangle = _c[_b];
            var description = describe(triangle);
            if (description in triangleCount) {
                triangleCount[description]++;
            }
            else {
                triangleCount[description] = 1;
            }
        }
        var newTriangles = [];
        for (var _d = 0, _e = this.triangles; _d < _e.length; _d++) {
            var triangle = _e[_d];
            var description = describe(triangle);
            if (triangleCount[description] >= 2) {
                continue;
            }
            newTriangles.push(triangle);
        }
        this.triangles = newTriangles;
    };
    Mesh.prototype.render = function () {
        var positions = [];
        var colors = [];
        var normals = [];
        for (var _i = 0, _a = this.triangles; _i < _a.length; _i++) {
            var triangle = _a[_i];
            for (var _b = 0, _c = triangle.vertices; _b < _c.length; _b++) {
                var vertex = _c[_b];
                positions.push.apply(positions, vertex.position);
                colors.push.apply(colors, vertex.color);
                normals.push.apply(normals, vertex.normal);
            }
        }
        return {
            positions: new Float32Array(positions),
            colors: new Float32Array(colors),
            normals: new Float32Array(normals)
        };
    };
    Mesh.prototype.smoothAttribute = function (group, attribute, eps) {
        var pointMap = {};
        var hash = function (x) { return Math.floor(x[0] / eps) + ":" + Math.floor(x[1] / eps) + ":" + Math.floor(x[2] / eps); };
        for (var _i = 0, _a = this.triangles; _i < _a.length; _i++) {
            var triangle = _a[_i];
            if (triangle.smoothingGroup != group) {
                continue;
            }
            for (var _b = 0, _c = triangle.vertices; _b < _c.length; _b++) {
                var vertex = _c[_b];
                pointMap[hash(vertex.position)] = pointMap[hash(vertex.position)] || [];
                pointMap[hash(vertex.position)][triangle.smoothingGroup] = [];
            }
        }
        for (var _d = 0, _e = this.triangles; _d < _e.length; _d++) {
            var triangle = _e[_d];
            if (triangle.smoothingGroup != group) {
                continue;
            }
            for (var _f = 0, _g = triangle.vertices; _f < _g.length; _f++) {
                var vertex = _g[_f];
                pointMap[hash(vertex.position)][triangle.smoothingGroup].push(vertex[attribute]);
            }
        }
        for (var _h = 0, _j = this.triangles; _h < _j.length; _h++) {
            var triangle = _j[_h];
            if (triangle.smoothingGroup != group) {
                continue;
            }
            for (var _k = 0, _l = triangle.vertices; _k < _l.length; _k++) {
                var vertex = _l[_k];
                var otherAttributes = pointMap[hash(vertex.position)][triangle.smoothingGroup];
                var combined = attributeCombiner[attribute](otherAttributes);
                vertex[attribute] = combined;
                // nearbyNormals[1 % nearbyNormals.length];
                // unit(nearbyNormals.reduce(add, [0, 0, 0]));
            }
        }
    };
    return Mesh;
}());
// TODO: hierarchical meshes?
var worldMesh = new Mesh();
var _loop_2 = function (p) {
    var cs = hexCorners(p);
    var bladeCount = 30 * randomChoose([0, 0, 0, 1, 1 / 8, 1 / 8, 1 / 20]);
    var corners = [];
    var neighbors = hexNeighbors(p);
    for (var i = 0; i < 6; i++) {
        var n1 = neighbors[i];
        var n2 = neighbors[(i + 1) % 6];
        var pos1 = hexToWorld(p);
        var pos2 = hexToWorld(n1);
        var pos3 = hexToWorld(n2);
        var point = { wx: (pos1.wx + pos2.wx + pos3.wx) / 3, wy: (pos1.wy + pos2.wy + pos3.wy) / 3 };
        var hs = [];
        if (isTile(n1)) {
            hs.push(heightOf(n1));
        }
        if (isTile(n2)) {
            hs.push(heightOf(n2));
        }
        var height = cornerHeightCombine(heightOf(p), hs);
        corners.push({ point: point, height: height });
    }
    var bladeChance = 1 / 300;
    if (Math.random() < 1 / 30) {
        bladeChance = 0.7;
    }
    var _loop_3 = function (i) {
        var _a = hexToWorld(p), wx = _a.wx, wy = _a.wy;
        var _b = corners[i].point, ax = _b.wx, ay = _b.wy; // cs[i];
        var _c = corners[(i + 1) % 6].point, bx = _c.wx, by = _c.wy;
        var reheight = function (h) { return -h * 0.25; };
        var mainHeight = reheight(heightOf(p));
        var cornerAHeight = reheight(corners[i].height);
        var cornerBHeight = reheight(corners[(i + 1) % 6].height);
        var hexColor = [0.4, 0.6, 0.25];
        // dirt: [0.9, 0.65, 0.35];
        hexColor = hexColor.map(function (x) { return x * (heightOf(p) * 0.04 + 0.8); });
        worldMesh.addSingleColor([[wx, mainHeight, wy], [ax, cornerAHeight, ay], [bx, cornerBHeight, by]], hexColor, "surface");
        var sideShadow = 0.4;
        var grassColor = hexColor; //  [0.3, 0.4, 0.2]
        grassColor = grassColor.map(function (x) { return Math.max(0, x * 0.7 - 0.05); });
        var adjacentTile = neighbors[(i + 1) % 6];
        if (!isTile(adjacentTile) || heightOf(adjacentTile) < heightOf(p) - 1) {
            var stoneColor = function (light) {
                if (light === void 0) { light = 1; }
                var bright = 1.25 + Math.random() * 0.5;
                bright *= light;
                var grey = 0.4;
                return add(scale(bright * grey, hexColor), scale(1 - grey, [1, 1, 1]));
            };
            worldMesh.addSingleColor([[ax, cornerAHeight, ay], [bx, cornerBHeight, by], [bx, 8, by]], stoneColor(), "wall");
            worldMesh.addSingleColor([[ax, cornerAHeight, ay], [bx, 8, by], [ax, 8, ay]], stoneColor(), "wall");
            var _loop_4 = function (j) {
                var wallDifference = subtract([bx, cornerBHeight, by], [ax, cornerAHeight, ay]);
                var wallDir = scale(1 / magnitude([wallDifference[0], 0, wallDifference[2]]), wallDifference);
                var outDir = unit([wallDir[2], 0, -wallDir[0]]);
                var wallLength = magnitude([wallDifference[0], 0, wallDifference[2]]);
                var boxLength = Math.random() * 0.2 + 0.15;
                var boxStart = Math.random() * (wallLength - boxLength);
                var boxWidth = Math.random() * 0.1 + 0.05;
                var boxHeight = Math.random() * 0.05 + 0.01;
                var topA = add([ax, cornerAHeight - boxHeight, ay], scale(boxStart, wallDir));
                var botA = add([ax, 8, ay], scale(boxStart, wallDir));
                var up = [0, -1, 0];
                var color = stoneColor();
                var addQuad = function (a, b, d, draw) {
                    if (draw === void 0) { draw = color; }
                    worldMesh.addSingleColor([b, a, add(a, d)], draw, "cliff");
                    worldMesh.addSingleColor([b, add(a, d), add(b, d)], draw, "cliff");
                };
                // front
                addQuad(add(topA, scale(boxWidth / 2, outDir), scale(boxHeight, up)), add(botA, scale(boxWidth / 2, outDir)), scale(boxLength, wallDir));
                // side 1
                addQuad(add(botA, scale(-boxWidth / 2, outDir)), add(topA, scale(-boxWidth / 2, outDir), scale(boxHeight, up)), scale(boxLength, wallDir));
                // side 2
                addQuad(add(topA, scale(-boxWidth / 2, outDir), scale(boxHeight, up)), add(botA, scale(-boxWidth / 2, outDir)), scale(boxWidth, outDir));
                // back
                addQuad(add(botA, scale(-boxWidth / 2, outDir), scale(boxLength, wallDir)), add(topA, scale(-boxWidth / 2, outDir), scale(boxHeight, up), scale(boxLength, wallDir)), scale(boxWidth, outDir));
                // top
                addQuad(add(topA, scale(-boxWidth / 2, outDir), scale(boxHeight, up)), add(topA, scale(-boxWidth / 2, outDir), scale(boxHeight, up), scale(boxLength, wallDir)), scale(boxWidth, outDir), grassColor);
            };
            for (var j = 0; j < 2; j++) {
                _loop_4(j);
            }
            var _loop_5 = function (j) {
                var wallDifference = subtract([bx, cornerBHeight, by], [ax, cornerAHeight, ay]);
                var wallDir = scale(1 / magnitude([wallDifference[0], 0, wallDifference[2]]), wallDifference);
                var outDir = unit([wallDir[2], 0, -wallDir[0]]);
                var wallLength = magnitude([wallDifference[0], 0, wallDifference[2]]);
                var boxLength = Math.random() * 0.2 + 0.25;
                var boxStart = Math.random() * (wallLength - boxLength);
                var boxWidth = Math.random() * 0.2 + 0.2;
                var boxHeight = -Math.random() * 1 - 0.15;
                var topA = add([ax, cornerAHeight - boxHeight, ay], scale(boxStart, wallDir));
                var botA = add([ax, 8, ay], scale(boxStart, wallDir));
                var up = [0, -1, 0];
                var color = stoneColor(0.75);
                var addQuad = function (a, b, d, draw) {
                    if (draw === void 0) { draw = color; }
                    worldMesh.addSingleColor([b, a, add(a, d)], draw, "cliff");
                    worldMesh.addSingleColor([b, add(a, d), add(b, d)], draw, "cliff");
                };
                // front
                addQuad(add(topA, scale(boxWidth / 2, outDir), scale(boxHeight, up)), add(botA, scale(boxWidth / 2, outDir)), scale(boxLength, wallDir));
                // side 1
                addQuad(add(botA, scale(-boxWidth / 2, outDir)), add(topA, scale(-boxWidth / 2, outDir), scale(boxHeight, up)), scale(boxLength, wallDir));
                // side 2
                addQuad(add(topA, scale(-boxWidth / 2, outDir), scale(boxHeight, up)), add(botA, scale(-boxWidth / 2, outDir)), scale(boxWidth, outDir));
                // back
                addQuad(add(botA, scale(-boxWidth / 2, outDir), scale(boxLength, wallDir)), add(topA, scale(-boxWidth / 2, outDir), scale(boxHeight, up), scale(boxLength, wallDir)), scale(boxWidth, outDir));
                // top
                addQuad(add(topA, scale(-boxWidth / 2, outDir), scale(boxHeight, up)), add(topA, scale(-boxWidth / 2, outDir), scale(boxHeight, up), scale(boxLength, wallDir)), scale(boxWidth, outDir));
            };
            // TODO: only if the height difference is large enough
            for (var j = 0; j < 2; j++) {
                _loop_5(j);
            } // TODO: only conditioned on large difference (save triangles and avoid artifacts)
        }
        while (Math.random() < bladeChance) {
            // add a clump
            var dm = Math.random() + 0.1;
            var da = Math.random();
            var db = Math.random();
            var clumpX = (dm * wx + da * ax + db * bx) / (dm + da + db);
            var clumpY = (dm * wy + da * ay + db * by) / (dm + da + db);
            var clumpH = (dm * mainHeight + da * cornerAHeight + db * cornerBHeight) / (dm + da + db);
            var size = 0.5 + Math.random() * 0.3;
            for (var i_1 = 0; i_1 < 5 + Math.random() * 30; i_1++) {
                var ox = (Math.random() * 2 - 1) * 0.05 * size;
                var oy = (Math.random() * 2 - 1) * 0.05 * size;
                var om = Math.sqrt(Math.pow(ox, 2) + Math.pow(oy, 2));
                ox /= om;
                oy /= om;
                ox *= 0.05 * size;
                oy *= 0.05 * size;
                var sx = (Math.random() * 2 - 1) * 0.05 * size;
                var sy = (Math.random() * 2 - 1) * 0.05 * size;
                var lx = -oy;
                var ly = ox;
                var oh = (Math.random() * 0.2 + 0.05) * size;
                var bladeShade = Math.random() * 0.3 + 1.6;
                clumpX += sx;
                clumpY += sy;
                var bladeColor = [grassColor[0] * bladeShade, grassColor[1] * bladeShade, grassColor[2] * bladeShade];
                worldMesh.addSingleColor([[clumpX - lx, clumpH + 0.1, clumpY - ly], [clumpX - ox + lx, clumpH - oh, clumpY - oy + ly], [clumpX + ox + lx, clumpH - oh, clumpY + oy + ly]], bladeColor);
                worldMesh.addSingleColor([[clumpX - ox + lx, clumpH - oh, clumpY - oy + ly], [clumpX + 3 * lx, clumpH - oh * 2, clumpY + 3 * ly], [clumpX + ox + lx, clumpH - oh, clumpY + oy + ly]], bladeColor);
                clumpX -= sx;
                clumpY -= sy;
            }
        }
        if (Math.random() < 1 / 30) {
            // add a rock
            var r = 0.05 + Math.random() * 0.1;
            var dm = Math.random() + 0.3 + r;
            var da = Math.random();
            var db = Math.random();
            var rockX = (dm * wx + da * ax + db * bx) / (dm + da + db);
            var rockY = (dm * wy + da * ay + db * by) / (dm + da + db);
            var rockH = (dm * mainHeight + da * cornerAHeight + db * cornerBHeight) / (dm + da + db);
            for (var s = 0; s < 7; s++) {
                var h = r;
                var d = 0.02;
                worldMesh.addSingleColor([
                    [rockX, rockH - h, rockY,],
                    [rockX + Math.cos(s / 7 * Math.PI * 2) * r, rockH + d, rockY + Math.sin(s / 7 * Math.PI * 2) * r],
                    [rockX + Math.cos((s + 1) / 7 * Math.PI * 2) * r, rockH + d, rockY + Math.sin((s + 1) / 7 * Math.PI * 2) * r],
                ], hexColor.map(function (x) { return x * 0.3 + 0.6; }), "rock");
            }
        }
    };
    for (var i = 0; i < 6; i++) {
        _loop_3(i);
    }
};
for (var _r = 0, tiles_1 = tiles; _r < tiles_1.length; _r++) {
    var p = tiles_1[_r];
    _loop_2(p);
}
worldMesh.removeDoubledSurfaces();
worldMesh.smoothAttribute("surface", "color", 0.01);
worldMesh.smoothAttribute("surface", "normal", 0.01);
worldMesh.smoothAttribute("rock", "normal", 0.1);
var worldRendered = worldMesh.render();
// Now, we take the contents of the JS array and put them into the WebGL buffer.
// This is relatively slow: the biggest slowness in rendering is often sending
// information from the CPU to the GPU (TODO: explain this better).
// Now we have to create some buffers.
// Buffers are arrays that hold data that we want to send to the GPU.
// We create and bind a buffer here:
var triangleVertexBuffer = gl.createBuffer();
gl.bindBuffer(gl.ARRAY_BUFFER, triangleVertexBuffer);
// ARRAY_BUFFER means that it holds per-vertex data.
// Binding the buffer means that it's currently being modified.
// It will stay bound until we bind something else.
// Take a look at https://developer.mozilla.org/en-US/docs/Web/API/WebGLRenderingContext/bindBuffer for more information.
// Now we funnel the data from our array into the currently bound buffer.
// STATIC_DRAW indicates that we're not going to frequently modify the contents of the buffer.
// If you're going to do that, use DYNAMIC_DRAW instead. It will be faster.
gl.bufferData(gl.ARRAY_BUFFER, worldRendered.positions, gl.STATIC_DRAW);
var triangleColorBuffer = gl.createBuffer();
gl.bindBuffer(gl.ARRAY_BUFFER, triangleColorBuffer);
gl.bufferData(gl.ARRAY_BUFFER, worldRendered.colors, gl.STATIC_DRAW);
var triangleNormalBuffer = gl.createBuffer();
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
function normalizeSet(vec) {
    var mag = Math.sqrt(vec[0] * vec[0] + vec[1] * vec[1] + vec[2] * vec[2]);
    vec[0] /= mag;
    vec[1] /= mag;
    vec[2] /= mag;
}
function scaleSet(u, k) {
    u[0] *= k;
    u[1] *= k;
    u[2] *= k;
}
function pos() {
    var r = Math.cos(Date.now() / 100) / 1000 + 6;
    return [Math.cos(Date.now() / 1000) * r, 0.4, Math.sin(Date.now() / 1000) * r];
}
var global = {
    forward: [0, 0, 0],
    right: [0, 0, 0],
    up: [0, 0, 0]
};
function lookAt(from, to) {
    var forward = [to[0] - from[0], to[1] - from[1], to[2] - from[2]];
    normalizeSet(forward);
    var right = cross(forward, [0, 1, 0]);
    normalizeSet(right);
    var up = cross(forward, right);
    global = { forward: forward, right: right, up: up };
    return [
        right[0], up[0], forward[0], -from[0],
        right[1], up[1], forward[1], -from[1],
        right[2], up[2], forward[2], -from[2],
        0, 0, 0, 1,
    ];
}
var cameraFocus = function () {
    var sum = { x: 0, y: 0 };
    for (var _i = 0, mass_7 = mass; _i < mass_7.length; _i++) {
        var tile = mass_7[_i];
        sum.x += hexToWorld(tile).wx;
        sum.y += hexToWorld(tile).wy;
    }
    sum.x /= mass.length;
    sum.y /= mass.length;
    return sum;
}();
var cameraZoom = -1;
var cameraViewAngle = 0;
var mouseStart = { x: 0, y: 0 };
var isDown = false;
var mouseEnd = { x: 0, y: 0 };
var mouseLast = { x: 0, y: 0 };
var mouseCurrent = { x: 0, y: 0 };
canvas.addEventListener("mousedown", function (e) {
    isDown = true;
    mouseStart = { x: e.offsetX, y: e.offsetY };
    mouseLast = mouseStart;
}, false);
canvas.addEventListener("mousemove", function (e) {
    mouseCurrent = { x: e.offsetX, y: e.offsetY };
    if (isDown) {
        cameraViewAngle -= (mouseCurrent.x - mouseLast.x) * 0.01;
        cameraZoom -= (mouseCurrent.y - mouseLast.y) * 0.01;
        cameraZoom = clamp(-2, cameraZoom, 2.5);
    }
    mouseLast = mouseCurrent;
}, false);
document.addEventListener("mouseup", function (e) {
    isDown = false;
    mouseEnd = mouseCurrent;
}, false);
canvas.addEventListener('touchstart', function (e) {
    e.preventDefault();
    isDown = true;
    mouseStart = { x: e.touches[0].clientX, y: e.touches[0].clientY };
    mouseLast = mouseStart;
}, false);
canvas.addEventListener('touchmove', function (e) {
    mouseCurrent = { x: e.touches[0].clientX, y: e.touches[0].clientY };
    if (isDown) {
        cameraViewAngle -= (mouseCurrent.x - mouseLast.x) * 0.01;
        cameraZoom -= (mouseCurrent.y - mouseLast.y) * 0.01;
        cameraZoom = clamp(-2, cameraZoom, 2.5);
    }
    mouseLast = mouseCurrent;
}, false);
canvas.addEventListener('touchcancel', function (e) {
    isDown = false;
    e.preventDefault();
}, false);
canvas.addEventListener('touchend', function (e) {
    isDown = false;
    e.preventDefault();
}, false);
var keysDown = {};
document.addEventListener('keydown', function (e) {
    keysDown[e.key] = true;
}, false);
document.addEventListener('keyup', function (e) {
    keysDown[e.key] = false;
}, false);
var shift = Math.PI / 2;
// Now, we get ready to draw our triangle:
var lastTick = Date.now();
function loop() {
    var currentTick = Date.now();
    var delta = currentTick - lastTick;
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
    var near = 0.1;
    var far = 80;
    var cameraDistance = 10 / Math.pow(2, cameraZoom);
    var zoomScale = 2;
    gl.uniformMatrix4fv(perspectiveUniform, false, [
        zoomScale, 0, 0, 0,
        0, zoomScale, 0, 0,
        0, 0, (near + far) / (near - far), -1,
        0, 0, near * far / (near - far) * 2, 0,
    ]);
    var t = Date.now() / 1000 / 10;
    var speed = 0.01;
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
    var from = [
        Math.cos(cameraViewAngle) * cameraDistance + cameraFocus.x,
        -3 - 0.5 * cameraDistance,
        Math.sin(cameraViewAngle) * cameraDistance + cameraFocus.y,
    ];
    var to = [
        cameraFocus.x,
        0,
        cameraFocus.y,
    ];
    var forward = [to[0] - from[0], to[1] - from[1], to[2] - from[2]];
    normalizeSet(forward); // make it into a unit vector
    scaleSet(forward, -1);
    var right = cross(forward, [0, 1, 0]);
    normalizeSet(right);
    var up = cross(forward, right);
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
function humanize(variable) {
    return variable.split(/(?=[A-Z])/).join(" ").toLowerCase();
}
var parametersDiv = document.getElementById("parameters");
parametersDiv.innerHTML += "<ul>";
function showParameter(name) {
    var value = generationParameters[name];
    if (typeof value == "number") {
        value = Math.floor(value * 10 + 0.5) / 10;
    }
    parametersDiv.innerHTML += "<li><em>" + humanize(name) + "</em>: " + value;
}
showParameter("tileCount");
showParameter("avoiderCount");
showParameter("smoothness");
parametersDiv.innerHTML += "</ul>";
var _a;
//# sourceMappingURL=main.js.map