define("utility", ["require", "exports"], function (require, exports) {
    "use strict";
    exports.__esModule = true;
    function randomChoose(xs) {
        return xs[Math.random() * xs.length | 0];
    }
    exports.randomChoose = randomChoose;
    function clamp(low, value, high) {
        return Math.min(high, Math.max(low, value));
    }
    exports.clamp = clamp;
    function range(xs) {
        return Math.max.apply(Math, xs) - Math.min.apply(Math, xs);
    }
    exports.range = range;
    function middle(xs) {
        return (Math.max.apply(Math, xs) + Math.min.apply(Math, xs)) / 2;
    }
    exports.middle = middle;
    function median(xs) {
        var ys = xs.slice(0).sort();
        if (ys.length % 2 == 0) {
            return (ys[ys.length / 2 - 1] + ys[ys.length / 2]) / 2;
        }
        return ys[ys.length / 2 | 0];
    }
    exports.median = median;
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
    exports.distinct = distinct;
});
define("generation", ["require", "exports", "utility"], function (require, exports, utility_1) {
    "use strict";
    exports.__esModule = true;
    var HexPos = (function () {
        function HexPos(hx, hy) {
            this.hx = hx;
            this.hy = hy;
        }
        HexPos.prototype.neighbors = function () {
            var result = [];
            for (var _i = 0, _a = [{ dx: 1, dy: 0 }, { dx: 1, dy: 1 }, { dx: 0, dy: 1 }, { dx: -1, dy: 0 }, { dx: -1, dy: -1 }, { dx: 0, dy: -1 }]; _i < _a.length; _i++) {
                var _b = _a[_i], dx = _b.dx, dy = _b.dy;
                result.push(new HexPos(this.hx + dx, this.hy + dy));
            }
            return result;
        };
        return HexPos;
    }());
    exports.HexPos = HexPos;
    var hexOrigin = new HexPos(0, 0);
    var generationParameters = {
        avoiderCount: Math.random() * 200 | 0,
        tileCount: Math.random() * 500 + 750 | 0,
        smoothness: Math.pow(Math.random(), 2) * 60
    };
    function hexToKey(cell) {
        return cell.hx + "H" + cell.hy;
    }
    function keyToHex(cell) {
        return new HexPos(parseInt(cell.split("H")[0]), parseInt(cell.split("H")[1]));
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
    exports.hexDistance = hexDistance;
    var HexMap = (function () {
        function HexMap() {
            this.underlying = {};
        }
        HexMap.prototype.contains = function (h) {
            return hexToKey(h) in this.underlying;
        };
        HexMap.prototype.set = function (h, v) {
            this.underlying[hexToKey(h)] = v;
        };
        HexMap.prototype.get = function (h) {
            return this.underlying[hexToKey(h)];
        };
        HexMap.prototype.getOr = function (h, otherwise) {
            if (this.contains(h)) {
                return this.get(h);
            }
            return otherwise;
        };
        HexMap.prototype.cells = function () {
            var out = [];
            for (var cell in this.underlying) {
                out.push(keyToHex(cell));
            }
            return out;
        };
        return HexMap;
    }());
    exports.HexMap = HexMap;
    ;
    function generateMap() {
        var mass = [hexOrigin];
        var massMap = new HexMap();
        massMap.set(hexOrigin, true);
        var avoiders = [];
        for (var i = 0; i < generationParameters.avoiderCount; i++) {
            avoiders.push({
                p: new HexPos(Math.random() * 100 - 50, Math.random() * 100 - 50),
                r: Math.pow(Math.random(), 2) * 5 + 2
            });
        }
        while (mass.length < generationParameters.tileCount) {
            var from = utility_1.randomChoose(mass);
            var neighbor = utility_1.randomChoose(from.neighbors());
            if (massMap.contains(neighbor)) {
                continue;
            }
            var reject = 0;
            for (var _i = 0, avoiders_1 = avoiders; _i < avoiders_1.length; _i++) {
                var avoider = avoiders_1[_i];
                reject = Math.max(reject, avoider.r - 2 * Math.pow(hexDistance(neighbor, avoider.p), 0.5));
            }
            // 0.9 is the fuzziness parameter.
            // if it's higher, borders become sharper but more regular
            // if it's much lower, borders completely disappear
            if (Math.random() < 0.9 && Math.random() < reject) {
                continue;
            }
            mass.push(neighbor);
            massMap.set(neighbor, true);
        }
        // mass has been generated
        var heightMap = new HexMap();
        heightMap.set(hexOrigin, 2);
        while (1) {
            var unassigned = [];
            for (var _a = 0, mass_1 = mass; _a < mass_1.length; _a++) {
                var p = mass_1[_a];
                if (heightMap.contains(p)) {
                    continue;
                }
                for (var _b = 0, _c = p.neighbors(); _b < _c.length; _b++) {
                    var n = _c[_b];
                    if (heightMap.contains(n)) {
                        unassigned.push({ p: p, v: heightMap.get(n) });
                    }
                }
            }
            if (unassigned.length == 0) {
                break;
            }
            var choice = utility_1.randomChoose(unassigned);
            heightMap.set(choice.p, utility_1.clamp(0, choice.v + (Math.random() * 100 < generationParameters.smoothness ? 0 : utility_1.randomChoose([1, -1])), 8));
        }
        // Great! We're getting there.
        var tiles = heightMap.cells();
        // Now, we smooth the result to eliminate areas of varying height with no strategic value.
        for (var i = 0; i < 10; i++) {
            var _loop_1 = function (j) {
                var tile = tiles[j];
                var h = heightMap.get(tile);
                var forbid = [];
                var neighbor = [];
                for (var _i = 0, _a = tile.neighbors(); _i < _a.length; _i++) {
                    var n = _a[_i];
                    if (heightMap.contains(n) && Math.abs(heightMap.get(n) - h) <= 2) {
                        neighbor.push(heightMap.get(n));
                    }
                }
                var countH0 = neighbor.filter(function (x) { return x == h; }).length;
                var countHU = neighbor.filter(function (x) { return x == h + 1; }).length;
                var countHD = neighbor.filter(function (x) { return x == h - 1; }).length;
                // this may create new connections, but it won't destroy existing ones
                if (neighbor.indexOf(h + 1) < 0 && countHD > countH0) {
                    heightMap.set(tile, h - 1);
                }
                if (neighbor.indexOf(h - 1) < 0 && countHU > countH0) {
                    heightMap.set(tile, h + 1);
                }
            };
            for (var j = 0; j < tiles.length; j++) {
                _loop_1(j);
            }
        }
        return {
            heightMap: heightMap
        };
    }
    exports.generateMap = generateMap;
});
define("matrix", ["require", "exports", "utility"], function (require, exports, utility_2) {
    "use strict";
    exports.__esModule = true;
    function cross(u, v) {
        return [u[1] * v[2] - u[2] * v[1], u[2] * v[0] - u[0] * v[2], u[0] * v[1] - u[1] * v[0]];
    }
    exports.cross = cross;
    function subtract(u, v) {
        return [u[0] - v[0], u[1] - v[1], u[2] - v[2]];
    }
    exports.subtract = subtract;
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
    exports.add = add;
    function multiply() {
        var us = [];
        for (var _i = 0; _i < arguments.length; _i++) {
            us[_i] = arguments[_i];
        }
        var sum = [1, 1, 1];
        for (var _a = 0, us_2 = us; _a < us_2.length; _a++) {
            var u = us_2[_a];
            sum[0] *= u[0];
            sum[1] *= u[1];
            sum[2] *= u[2];
        }
        return sum;
    }
    exports.multiply = multiply;
    function plus(u, v) {
        return add(u, v);
    }
    exports.plus = plus;
    function scale(k, v) {
        return [k * v[0], k * v[1], k * v[2]];
    }
    exports.scale = scale;
    function dot(a, b) {
        var s = 0;
        s += a[0] * b[0];
        s += a[1] * b[1];
        s += a[2] * b[2];
        return s;
    }
    exports.dot = dot;
    function magnitude(v) {
        return Math.sqrt(Math.pow(v[0], 2) + Math.pow(v[1], 2) + Math.pow(v[2], 2));
    }
    exports.magnitude = magnitude;
    function distance(v, u) {
        return magnitude(subtract(v, u));
    }
    exports.distance = distance;
    function unit(v) {
        return scale(1 / magnitude(v), v);
    }
    exports.unit = unit;
    function find(tree, point, epsilon) {
        var stack = [tree];
        while (stack.length > 0) {
            var branch = stack.pop();
            if (!branch) {
                continue;
            }
            if (distance(point, branch.pivot) < epsilon) {
                return branch.pivot;
            }
            if (point[branch.dimension] < branch.pivot[branch.dimension] + epsilon) {
                stack.push(branch.low);
            }
            if (point[branch.dimension] > branch.pivot[branch.dimension] - epsilon) {
                stack.push(branch.high);
            }
        }
        return null;
    }
    function insert(tree, point) {
        if (tree == null) {
            return { pivot: point, low: null, high: null, dimension: utility_2.randomChoose([0, 1, 2]) };
        }
        if (point[tree.dimension] < tree.pivot[tree.dimension]) {
            tree.low = insert(tree.low, point);
        }
        else {
            tree.high = insert(tree.high, point);
        }
        return tree;
    }
    var PointBunch = (function () {
        function PointBunch(epsilon) {
            this.id = ("" + Math.random()).substr(2, 3);
            this.tree = null;
            this.epsilon = epsilon;
        }
        PointBunch.prototype.identify = function (p) {
            var found = find(this.tree, p, this.epsilon);
            if (found) {
                return "$" + this.id + found.join(",");
            }
            this.tree = insert(this.tree, p);
            return "$" + this.id + p.join(",");
        };
        return PointBunch;
    }());
    exports.PointBunch = PointBunch;
    var PointMap = (function () {
        function PointMap(epsilon, maker) {
            this.maker = maker;
            this.map = {};
            this.bunch = new PointBunch(epsilon);
        }
        PointMap.prototype.get = function (p) {
            var id = this.bunch.identify(p);
            if (id in this.map) {
                return this.map[id];
            }
            return this.map[id] = this.maker();
        };
        PointMap.prototype.put = function (p, value) {
            var id = this.bunch.identify(p);
            this.map[id] = value;
        };
        return PointMap;
    }());
    exports.PointMap = PointMap;
});
/*
export type Vertex<T extends {[k: string]: AttributeType}, Position extends string, Normal extends string> = {[k in keyof T]: AttributeMap[T[k]]} & {[k: Position & string]: Vec3}

export type Triangle<T extends {[k: string]: AttributeType}> = {vertices: [Vertex<T>, Vertex<T>, Vertex<T>], smoothingGroup?: string};

export type PointSetBranch<T> = {
    next: {pivot: Vec3, value: T, low: PointSetBranch<T>, high: PointSetBranch<T>} | null;
    dimension: 0 | 1 | 2;
};

export function compressPath(path: string): string {
    return path.replace(/LL/g, "A").replace(/RR/g, "B").replace(/LR/g, "C").replace(/RL/g, "D");
}

export class PointSet<T> {
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

export let attributeCombiner = {
    normal: (list: Vec3[]): Vec3 => unit(list.reduce(plus, [0, 0, 0])),
    color: (list: Vec3[]): Vec3 => scale(1 / list.length, list.reduce(plus, [0, 0, 0])),
};

type VertexAttributes = { [k: string]: "vec3" | "vec4" | "mat4" };

export class Mesh<T extends VertexAttributes, Position extends string, Normal extends string> {
    triangles: Triangle<T & {[k in Position]: "vec3"} & {[k in Normal]: "vec3"}>[];
    private positionName: Position;
    private normalName: Normal;
    constructor(attributes: T, positionName: Position, normalName: Normal) {
        this.triangles = [];
        this.positionName = positionName;
        this.normalName = normalName;
    }
    count() {
        return this.triangles.length;
    }
    addTriangle(posA: Vec3, posB: Vec3, posC: Vec3, otherAttributes: Vertex<T>, smoothingGroup?: string) {
        // note that orientation matters to determine normal
        let normal = unit(cross(subtract(posB, posA), subtract(posC, posA)));
        let newVertices = [
            { [this.positionName as string]: posA, [this.normalName as string]: normal },
            { [this.positionName as string]: posB, [this.normalName as string]: normal },
            { [this.positionName as string]: posC, [this.normalName as string]: normal },
        ] as any;
        for (let vertex of newVertices) {
            for (let attribute in otherAttributes) {
                vertex[attribute] = otherAttributes[attribute];
            }
        }
        this.triangles.push({
            vertices: newVertices,
            smoothingGroup,
        });
    }
    render(): Triangle<T & {[k in Position]: "vec3"} & {[k in Normal]: "vec3"}>[] {
        return this.triangles;
    }
    smoothAttribute<Attribute extends Normal | keyof T>(group: string, attribute: Attribute, eps: number, combiner: (xs: (T[Attribute] | ({[k in Normal]: Vec3})[Attribute])[]) => (T[Attribute] | ({[k in Normal]: Vec3})[Attribute])) {
        let pointMap: {[hash: string]: {[g: string]: Vec3[]}} = {};
        let hash = (x: Vec3) => Math.floor(x[0] / eps) + ":" + Math.floor(x[1] / eps) + ":" + Math.floor(x[2] / eps);
        for (let triangle of this.triangles) {
            if (triangle.smoothingGroup != group) {
                continue;
            }
            for (let vertex of triangle.vertices) {
                let c: Vec3 = (vertex as Vertex<{[k in Position]: "vec3"}>)[this.positionName];
                pointMap[hash(vertex[this.positionName])] = pointMap[hash(vertex[this.positionName])] || [];
                pointMap[hash(vertex[this.positionName])][triangle.smoothingGroup] = [];
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
                let combined = combiner(otherAttributes);
                vertex[attribute] = combined;
            }
        }
    }
}
*/ 
define("glacial", ["require", "exports"], function (require, exports) {
    "use strict";
    exports.__esModule = true;
    var textureSize = 512;
    // TODO: include where it renders to in the type 
    var Glacier = (function () {
        function Glacier(options) {
            this.target = options.target;
            this.count = 0;
            this.gl = options.context;
            this.vertexShader = this.gl.createShader(this.gl.VERTEX_SHADER); // TODO: check error
            this.gl.shaderSource(this.vertexShader, options.vertexShader);
            this.gl.compileShader(this.vertexShader);
            if (!this.gl.getShaderParameter(this.vertexShader, this.gl.COMPILE_STATUS)) {
                throw { message: "error loading vertex shader: " + this.gl.getShaderInfoLog(this.vertexShader) };
            }
            this.fragmentShader = this.gl.createShader(this.gl.FRAGMENT_SHADER); // TODO: check error
            this.gl.shaderSource(this.fragmentShader, options.fragmentShader);
            this.gl.compileShader(this.fragmentShader);
            if (!this.gl.getShaderParameter(this.fragmentShader, this.gl.COMPILE_STATUS)) {
                throw { message: "error loading fragment shader: " + this.gl.getShaderInfoLog(this.fragmentShader) };
            }
            this.program = this.gl.createProgram(); // TODO: check error
            this.gl.attachShader(this.program, this.vertexShader);
            this.gl.attachShader(this.program, this.fragmentShader);
            this.gl.linkProgram(this.program);
            if (!this.gl.getProgramParameter(this.program, this.gl.LINK_STATUS)) {
                throw { message: "error linking program: " + this.gl.getProgramInfoLog(this.program) };
            }
            this.attributeLocations = {}; // note: add all properties below
            this.attributeBuffers = {}; // note: add all properties below
            for (var attribute in options.specification.attributes) {
                this.attributeLocations[attribute] = this.gl.getAttribLocation(this.program, attribute); // TODO: check error
                this.attributeBuffers[attribute] = this.gl.createBuffer(); // TODO: check error
            }
            this.uniformLocations = {}; // note: add all properties below
            for (var uniform in options.specification.uniforms) {
                this.uniformLocations[uniform] = this.gl.getUniformLocation(this.program, uniform); // TODO: check error
            }
            this.specification = options.specification;
            this.gl.enable(this.gl.DEPTH_TEST); // TODO: make this configurable
            if (this.target == "texture") {
                var gl = this.gl;
                // screen
                var framebuffer = gl.createFramebuffer(); // TODO: catch error
                // depth
                var renderBuffer = gl.createRenderbuffer(); // TODO: catch error
                gl.bindRenderbuffer(gl.RENDERBUFFER, renderBuffer);
                gl.renderbufferStorage(gl.RENDERBUFFER, gl.DEPTH_COMPONENT16, textureSize, textureSize);
                // texture
                var texture = gl.createTexture(); // TODO: catch error
                gl.bindTexture(gl.TEXTURE_2D, texture);
                gl.pixelStorei(gl.UNPACK_FLIP_Y_WEBGL, true);
                gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA, textureSize, textureSize, 0, gl.RGBA, gl.UNSIGNED_BYTE, undefined);
                gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, gl.LINEAR);
                gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, gl.NEAREST);
                // assign frame depth
                gl.bindFramebuffer(gl.FRAMEBUFFER, framebuffer);
                gl.bindRenderbuffer(gl.RENDERBUFFER, renderBuffer);
                gl.framebufferRenderbuffer(gl.FRAMEBUFFER, gl.DEPTH_ATTACHMENT, gl.RENDERBUFFER, renderBuffer);
                // assign frame texture
                gl.bindFramebuffer(gl.FRAMEBUFFER, framebuffer);
                gl.framebufferTexture2D(gl.FRAMEBUFFER, gl.COLOR_ATTACHMENT0, gl.TEXTURE_2D, texture, 0);
                this.viewport = [0, 0, textureSize, textureSize]; // TODO: make this configurable
                this.frameData = { type: "texture", framebuffer: framebuffer, renderBuffer: renderBuffer, texture: texture };
            }
            else {
                this.frameData = { type: "screen" };
                this.viewport = [0, 0, 600, 600]; // TODO: make this configurable
            }
        }
        Glacier.prototype.loadTexture = function (src, callback) {
            var _this = this;
            var image = new Image();
            var texture = this.gl.createTexture(); // TODO: error 
            image.src = src;
            image.onload = function () {
                _this.gl.bindTexture(_this.gl.TEXTURE_2D, texture);
                _this.gl.texImage2D(_this.gl.TEXTURE_2D, 0, _this.gl.RGBA, _this.gl.RGBA, _this.gl.UNSIGNED_BYTE, image);
                _this.gl.texParameteri(_this.gl.TEXTURE_2D, _this.gl.TEXTURE_MAG_FILTER, _this.gl.NEAREST);
                _this.gl.texParameteri(_this.gl.TEXTURE_2D, _this.gl.TEXTURE_MIN_FILTER, _this.gl.NEAREST);
                callback();
            };
            return texture;
        };
        Glacier.prototype.bufferTriangles = function (triangles) {
            for (var attribute in this.attributeBuffers) {
                var flattened = [];
                for (var _i = 0, triangles_1 = triangles; _i < triangles_1.length; _i++) {
                    var triangle = triangles_1[_i];
                    for (var _a = 0, triangle_1 = triangle; _a < triangle_1.length; _a++) {
                        var vertex = triangle_1[_a];
                        var data = vertex[attribute];
                        if (typeof data == "number") {
                            flattened.push(data);
                        }
                        else {
                            // TODO: is this the right type?
                            flattened.push.apply(flattened, data);
                        }
                    }
                }
                this.gl.bindBuffer(this.gl.ARRAY_BUFFER, this.attributeBuffers[attribute]);
                this.gl.bufferData(this.gl.ARRAY_BUFFER, new Float32Array(flattened), this.gl.STATIC_DRAW);
            }
            this.count = triangles.length;
        };
        Glacier.prototype.activate = function () {
            this.gl.useProgram(this.program);
            var v = this.viewport;
            this.gl.viewport(v[0], v[1], v[2], v[3]);
            for (var attribute in this.attributeLocations) {
                this.gl.enableVertexAttribArray(this.attributeLocations[attribute]);
            }
            if (this.frameData.type == "screen") {
                this.gl.bindFramebuffer(this.gl.FRAMEBUFFER, null);
            }
            else {
                this.gl.bindFramebuffer(this.gl.FRAMEBUFFER, this.frameData.framebuffer);
            }
        };
        Glacier.prototype.deactivate = function () {
            for (var attribute in this.attributeLocations) {
                this.gl.disableVertexAttribArray(this.attributeLocations[attribute]);
            }
        };
        Glacier.prototype.setUniform = function (values) {
            for (var uniform in values) {
                switch (this.specification.uniforms[uniform]) {
                    case "float": {
                        this.gl.uniform1f(this.uniformLocations[uniform], values[uniform]);
                        break;
                    }
                    case "vec4": {
                        var value = values[uniform]; // TODO: typesafe
                        this.gl.uniform4f(this.uniformLocations[uniform], value[0], value[1], value[2], value[3]);
                        break;
                    }
                    case "vec3": {
                        var value = values[uniform]; // TODO: typesafe
                        this.gl.uniform3f(this.uniformLocations[uniform], value[0], value[1], value[2]);
                        break;
                    }
                    case "vec2": {
                        var value = values[uniform]; // TODO: typesafe
                        this.gl.uniform2f(this.uniformLocations[uniform], value[0], value[1]);
                        break;
                    }
                    case "mat4": {
                        var value = values[uniform]; // TODO: typesafe
                        this.gl.uniformMatrix4fv(this.uniformLocations[uniform], false, value);
                        break;
                    }
                    case "image": {
                        var value = values[uniform]; // TODO: typesafe
                        this.gl.activeTexture(this.gl.TEXTURE0 + value.index);
                        this.gl.bindTexture(this.gl.TEXTURE_2D, value.texture);
                        this.gl.uniform1i(this.uniformLocations[uniform], value.index);
                        break;
                    }
                    default: {
                        throw "unknown";
                    }
                }
            }
        };
        Glacier.prototype.draw = function (options) {
            if (options.clearColor && options.clearColor != "no-clear") {
                this.gl.clearColor(options.clearColor[0], options.clearColor[1], options.clearColor[2], 1);
                this.gl.clear(this.gl.COLOR_BUFFER_BIT | this.gl.DEPTH_BUFFER_BIT);
            }
            // assign each buffer to its attribute
            var sizeof = {
                float: 1,
                vec2: 2,
                vec3: 3,
                vec4: 4,
                mat4: 16
            };
            for (var attribute in this.attributeBuffers) {
                this.gl.bindBuffer(this.gl.ARRAY_BUFFER, this.attributeBuffers[attribute]);
                // TODO: support integer attributes, and fancier layouts
                var attributeType = this.specification.attributes[attribute];
                this.gl.vertexAttribPointer(this.attributeLocations[attribute], sizeof[attributeType], this.gl.FLOAT, false, 0, 0);
            }
            this.gl.drawArrays(this.gl.TRIANGLES, 0, this.count * 3);
        };
        Glacier.float = "float";
        Glacier.vec2 = "vec2";
        Glacier.vec3 = "vec3";
        Glacier.vec4 = "vec4";
        Glacier.mat2 = "mat2";
        Glacier.mat3 = "mat3";
        Glacier.mat4 = "mat4";
        Glacier.image = "image";
        return Glacier;
    }());
    exports.Glacier = Glacier;
    function getGlacialTexture(g) {
        // TODO: maybe make this typesafe
        return g.frameData.texture;
    }
    exports.getGlacialTexture = getGlacialTexture;
});
define("main", ["require", "exports", "generation", "utility", "matrix", "glacial"], function (require, exports, generation_1, utility_3, matrix_1, glacial_1) {
    "use strict";
    exports.__esModule = true;
    var canvas = document.getElementById("canvas");
    canvas.width = 600;
    canvas.height = 600;
    function hexToWorld(pos) {
        var hx = pos.hx, hy = pos.hy;
        return { wx: hx + hy * Math.cos(Math.PI * 2 / 3), wy: hy * Math.sin(Math.PI * 2 / 3) };
    }
    function hexCorners(p) {
        var ns = p.neighbors();
        var rs = [];
        for (var i = 0; i < 6; i++) {
            var _a = hexToWorld(p), cx = _a.wx, cy = _a.wy;
            var _b = hexToWorld(ns[i]), ax = _b.wx, ay = _b.wy;
            var _c = hexToWorld(ns[(i + 1) % 6]), bx = _c.wx, by = _c.wy;
            rs[i] = { wx: (ax + bx + cx) / 3, wy: (ay + by + cy) / 3 };
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
    var tryGL = canvas.getContext("webgl");
    if (!tryGL) {
        throw "unable to get webGL context";
    }
    var gl = tryGL;
    var specification = {
        uniforms: {
            perspective: glacial_1.Glacier.mat4,
            cameraPosition: glacial_1.Glacier.mat4,
            camera: glacial_1.Glacier.mat4,
            lightDirection: glacial_1.Glacier.vec3,
            shadowMap: glacial_1.Glacier.image,
            shadowPerspective: glacial_1.Glacier.mat4,
            shadowCamera: glacial_1.Glacier.mat4,
            shadowCameraPosition: glacial_1.Glacier.mat4,
            shadowScale: glacial_1.Glacier.float,
            shadowSource: glacial_1.Glacier.vec3,
            noiseTexture: glacial_1.Glacier.image
        },
        attributes: {
            vertexPosition: glacial_1.Glacier.vec3,
            vertexColor: glacial_1.Glacier.vec3,
            vertexNormal: glacial_1.Glacier.vec3,
            vertexBanding: glacial_1.Glacier.float
        }
    };
    exports.glacier = new glacial_1.Glacier({
        vertexShader: "\n    precision mediump float;\n    uniform mat4 perspective;\n    uniform mat4 cameraPosition;\n    uniform mat4 camera;\n\n    attribute vec3 vertexPosition;\n    attribute vec3 vertexColor;\n    attribute vec3 vertexNormal;\n    attribute float vertexBanding;\n\n    varying vec3 fragmentPosition;\n    varying vec3 fragmentColor;\n    varying vec3 fragmentNormal;\n    varying float fragmentBanding;\n\n    void main(void) {\n        gl_Position = perspective * camera * cameraPosition * vec4(vertexPosition, 1.0);\n        fragmentPosition = vertexPosition;\n        fragmentColor = vertexColor;\n        fragmentNormal = vertexNormal;\n        fragmentBanding = vertexBanding;\n    }\n\n    ",
        fragmentShader: "\n    precision mediump float;\n    uniform vec3 lightDirection;\n\n    uniform mat4 shadowPerspective;\n    uniform mat4 shadowCamera;\n    uniform mat4 shadowCameraPosition;\n    uniform float shadowScale;\n    uniform vec3 shadowSource;\n    uniform sampler2D shadowMap;\n\n    varying vec3 fragmentPosition;\n    varying vec3 fragmentColor;\n    varying vec3 fragmentNormal;\n    varying float fragmentBanding;\n    \n    uniform mat4 cameraPosition;\n\n    uniform sampler2D noiseTexture;\n    \n    void main(void) {\n        vec3 eye = -(cameraPosition * vec4(0.0, 0.0, 0.0, 1.0)).xyz;\n        vec3 eyeDir = normalize(eye - fragmentPosition);\n        if (dot(eyeDir, fragmentNormal) > 0.0) {\n            discard;\n        }\n\n        float y = min(1.0, max(0.0, 0.6 - fragmentPosition.y * 0.2));\n        float lambert = -dot(normalize(fragmentNormal), normalize(lightDirection)) * 0.45 + 0.65;\n        gl_FragColor = vec4(lambert * y * fragmentColor, 1.0);\n        float originalHeight = fragmentPosition.y * -4.0;\n        if (fragmentBanding > 0.91) {\n            gl_FragColor.rgb *= 0.96;\n        }\n        if (fragmentBanding > 0.95) {\n            gl_FragColor.rgb *= 0.95;\n        }\n\n        // shadows below\n\n        if (dot(fragmentNormal, lightDirection) > 0.0) {\n            // check before shadow map lookup\n            gl_FragColor.rgb *= 0.5; // shadowed\n        } else {\n            vec4 projected = shadowPerspective * shadowCamera * shadowCameraPosition * vec4(fragmentPosition, 1.0);\n            vec2 screen = projected.xy / projected.w;\n            if (abs(screen.x) < 1.0 && abs(screen.y) < 1.0) {\n                // only place shadows on things within the shadowmap's view\n                float shadowDistance = texture2D(shadowMap, screen*0.5 + 0.5).r;\n                float realDistance = max(0.0, min(1.0, distance(fragmentPosition, shadowSource) / shadowScale * 2.0 - 1.0));\n                if (realDistance > shadowDistance + 0.01) {\n                    gl_FragColor.rgb *= 0.5; // shadowed\n                }\n            }\n        }\n\n        // TODO: fewer texture samples here\n        gl_FragColor.rgb *= mix(0.7, 1.3, texture2D(noiseTexture, fragmentPosition.xz * 0.1).r);\n        gl_FragColor.rgb *= mix(0.7, 1.3, texture2D(noiseTexture, fragmentPosition.xy * vec2(0.05, 0.5)).r);\n        gl_FragColor.rgb *= mix(0.7, 1.3, texture2D(noiseTexture, fragmentPosition.zy * vec2(0.05, 0.5)).r);\n    }\n    ",
        specification: specification,
        context: gl,
        target: "screen"
    });
    var noiseAvailable = false;
    var noiseTexture = exports.glacier.loadTexture("noise.png", function () {
        noiseAvailable = true;
        console.log("loaded");
    });
    var shadowSpecification = {
        uniforms: {
            perspective: glacial_1.Glacier.mat4,
            camera: glacial_1.Glacier.mat4,
            cameraPosition: glacial_1.Glacier.mat4,
            shadowSource: glacial_1.Glacier.vec3,
            shadowScale: glacial_1.Glacier.float
        },
        attributes: {
            vertexPosition: glacial_1.Glacier.vec3
        }
    };
    exports.shadowGlacier = new glacial_1.Glacier({
        vertexShader: "\n    precision mediump float;\n    uniform mat4 perspective;\n    uniform mat4 cameraPosition;\n    uniform mat4 camera;\n\n    attribute vec3 vertexPosition;\n    varying vec3 fragmentPosition;\n\n    void main(void) {\n        gl_Position = perspective * camera * cameraPosition * vec4(vertexPosition, 1.0);\n        fragmentPosition = vertexPosition;\n    }\n    ",
        fragmentShader: "\n    precision mediump float;\n\n    varying vec3 fragmentPosition;\n\n    uniform vec3 shadowSource;\n    uniform float shadowScale;\n\n    void main(void) {\n        gl_FragColor = vec4(max(0.0, min(0.99, distance(fragmentPosition, shadowSource) / shadowScale * 2.0 - 1.0)) * vec3(1.0, 1.0, 1.0), 1.0);\n    }\n    ",
        specification: shadowSpecification,
        context: gl,
        target: "texture"
    });
    var waterSpecification = {
        uniforms: {
            perspective: glacial_1.Glacier.mat4,
            camera: glacial_1.Glacier.mat4,
            cameraPosition: glacial_1.Glacier.mat4,
            noiseTexture: glacial_1.Glacier.image,
            eyeLocation: glacial_1.Glacier.vec3,
            lightDirection: glacial_1.Glacier.vec3,
            time: glacial_1.Glacier.float,
            shadowMap: glacial_1.Glacier.image,
            shadowPerspective: glacial_1.Glacier.mat4,
            shadowCamera: glacial_1.Glacier.mat4,
            shadowCameraPosition: glacial_1.Glacier.mat4,
            shadowScale: glacial_1.Glacier.float,
            shadowSource: glacial_1.Glacier.vec3
        },
        attributes: {
            vertexPosition: glacial_1.Glacier.vec3
        }
    };
    var waterGlacier = new glacial_1.Glacier({
        vertexShader: "\n    precision mediump float;\n    uniform mat4 perspective;\n    uniform mat4 cameraPosition;\n    uniform mat4 camera;\n\n    attribute vec3 vertexPosition;\n    varying vec3 fragmentPosition;\n\n    void main(void) {\n        gl_Position = perspective * camera * cameraPosition * vec4(vertexPosition, 1.0);\n        fragmentPosition = vertexPosition;\n    }\n    ",
        fragmentShader: "\n    precision mediump float;\n\n    uniform vec3 eyeLocation;\n    uniform vec3 lightDirection;\n\n    uniform sampler2D noiseTexture;\n\n    uniform mat4 shadowPerspective;\n    uniform mat4 shadowCameraPosition;\n    uniform mat4 shadowCamera;\n    uniform float shadowScale;\n    uniform vec3 shadowSource;\n    uniform sampler2D shadowMap;\n\n    uniform float time;\n\n    varying vec3 fragmentPosition;\n\n    float height(vec2 pos) {\n        float waveSpeed = 0.5;\n        float amt = 0.5;\n        return mix(\n            -abs(texture2D(noiseTexture, pos + vec2(time*waveSpeed, 0.0)).r - 0.5) * 6.0,\n            -abs(texture2D(noiseTexture, pos + vec2(0.73 - time*waveSpeed, 0.43)).r - 0.5) * 6.0,\n            amt\n        );\n    }\n\n    float shadowLightness() {\n        vec4 projected = shadowPerspective * shadowCamera * shadowCameraPosition * vec4(fragmentPosition, 1.0);\n        vec2 screen = projected.xy / projected.w;\n        if (abs(screen.x) < 1.0 && abs(screen.y) < 1.0) {\n            // only place shadows on things within the shadowmap's view\n            float shadowDistance = texture2D(shadowMap, screen*0.5 + 0.5).r;\n            float realDistance = max(0.0, min(1.0, distance(fragmentPosition, shadowSource) / shadowScale * 2.0 - 1.0));\n            if (realDistance > shadowDistance + 0.01) {\n                return 0.0;\n            }\n        }\n        return 1.0;\n    }\n\n    vec3 sky(vec3 dir) {\n        if (dir.y > 0.0) {\n            dir = -dir;\n        }\n        vec3 ambient = vec3(0.2, 0.25, 0.29) * (texture2D(noiseTexture, vec2(dir.xz)).r*1.5 - 0.5);\n        vec3 sun = pow(dot(dir, lightDirection)*0.5 + 0.5, 800.0) * vec3(1.0, 1.0, 0.7);\n        return (vec3(0.09, 0.12, 0.2) + ambient)*mix(0.6, 1.0, shadowLightness()) + sun*mix(0.1, 1.0, shadowLightness());\n    }\n\n    void main(void) {\n\n        vec2 pos = fragmentPosition.xz * 0.3;\n\n        vec3 normal = normalize(cross(\n            vec3(1.0, height(pos + vec2(0.01, 0.00)) - height(pos), 0.0),\n            vec3(0.0, height(pos + vec2(0.00, 0.01)) - height(pos), 1.0)\n        ));\n        if (normal.y > 0.0) {\n            normal = -normal;\n        }\n\n        vec3 incident = normalize(fragmentPosition - eyeLocation);\n        vec3 bounced = reflect(incident, normal);\n        vec3 color = sky(bounced);\n        gl_FragColor = vec4(color, 1.0);\n    }\n    ",
        specification: waterSpecification,
        context: gl,
        target: "screen"
    });
    var lightDirection = matrix_1.unit([2, -4, 2]);
    // Now, let's create the vertices for our triangle, and send them to the GPU.
    function cornerHeightCombine(self, hs) {
        if (utility_3.range([self].concat(hs)) == 1) {
            return utility_3.median([self].concat(hs));
        }
        if (hs.length == 2 && utility_3.range([self].concat(hs)) == 2 && utility_3.distinct([self].concat(hs))) {
            return utility_3.middle([self].concat(hs));
        }
        if (hs.length == 2 && hs.filter(function (x) { return Math.abs(x - self) <= 1; }).length == 2) {
            return utility_3.middle([self].concat(hs));
        }
        if (hs.length == 2) {
            var nearby = hs.filter(function (x) { return Math.abs(x - self) <= 1; });
            return cornerHeightCombine(self, nearby);
        }
        return self;
    }
    var world = generation_1.generateMap();
    var meshTriangles = [];
    function triangleNormal(a, b, c) {
        return matrix_1.unit(matrix_1.cross(matrix_1.subtract(b, a), matrix_1.subtract(c, a)));
    }
    function addTriangle(va, vb, vc, attributes, group) {
        var banding = attributes.vertexBanding || 0;
        var normal = triangleNormal(va, vb, vc);
        meshTriangles.push({
            vertices: [
                { vertexPosition: va, vertexNormal: normal, vertexColor: attributes.vertexColor, vertexBanding: banding },
                { vertexPosition: vb, vertexNormal: normal, vertexColor: attributes.vertexColor, vertexBanding: 0 },
                { vertexPosition: vc, vertexNormal: normal, vertexColor: attributes.vertexColor, vertexBanding: banding }
            ],
            metadata: { group: group }
        });
    }
    var _loop_2 = function (p) {
        var cs = hexCorners(p);
        var bladeCount = 30 * utility_3.randomChoose([0, 0, 0, 1, 1 / 8, 1 / 8, 1 / 20]);
        var corners = [];
        var neighbors = p.neighbors();
        for (var i = 0; i < 6; i++) {
            var n1 = neighbors[i];
            var n2 = neighbors[(i + 1) % 6];
            var pos1 = hexToWorld(p);
            var pos2 = hexToWorld(n1);
            var pos3 = hexToWorld(n2);
            var point = { wx: (pos1.wx + pos2.wx + pos3.wx) / 3, wy: (pos1.wy + pos2.wy + pos3.wy) / 3 };
            var hs = [];
            if (world.heightMap.contains(n1)) {
                hs.push(world.heightMap.get(n1));
            }
            if (world.heightMap.contains(n2)) {
                hs.push(world.heightMap.get(n2));
            }
            var height = cornerHeightCombine(world.heightMap.get(p), hs);
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
            var mainHeight = reheight(world.heightMap.get(p));
            var cornerAHeight = reheight(corners[i].height);
            var cornerBHeight = reheight(corners[(i + 1) % 6].height);
            var hexColor = [0.4, 0.6, 0.25];
            // dirt: [0.9, 0.65, 0.35];
            hexColor = hexColor.map(function (x) { return x * (world.heightMap.get(p) * 0.04 + 0.8); });
            addTriangle([ax, cornerAHeight, ay], [wx, mainHeight, wy], [bx, cornerBHeight, by], { vertexColor: hexColor, vertexBanding: 1 }, "surface");
            var sideShadow = 0.4;
            var grassColor = hexColor; //  [0.3, 0.4, 0.2]
            grassColor = grassColor.map(function (x) { return Math.max(0, x * 0.7 - 0.05); });
            var adjacentTile = neighbors[(i + 1) % 6];
            if (!world.heightMap.contains(adjacentTile) || world.heightMap.get(adjacentTile) < world.heightMap.get(p) - 1) {
                var stoneColor = function (light) {
                    if (light === void 0) { light = 1; }
                    var bright = 1.25 + Math.random() * 0.5;
                    bright *= light;
                    var grey = 0.4;
                    return matrix_1.add(matrix_1.scale(bright * grey, hexColor), matrix_1.scale(1 - grey, [1, 1, 1]));
                };
                addTriangle([ax, cornerAHeight, ay], [bx, cornerBHeight, by], [bx, 8, by], { vertexColor: stoneColor() }, "wall");
                addTriangle([ax, cornerAHeight, ay], [bx, 8, by], [ax, 8, ay], { vertexColor: stoneColor() }, "wall");
                var _loop_4 = function (j) {
                    var wallDifference = matrix_1.subtract([bx, cornerBHeight, by], [ax, cornerAHeight, ay]);
                    var wallDir = matrix_1.scale(1 / matrix_1.magnitude([wallDifference[0], 0, wallDifference[2]]), wallDifference);
                    var outDir = matrix_1.unit([wallDir[2], 0, -wallDir[0]]);
                    var wallLength = matrix_1.magnitude([wallDifference[0], 0, wallDifference[2]]);
                    var boxLength = Math.random() * 0.2 + 0.15;
                    var boxStart = Math.random() * (wallLength - boxLength);
                    var boxWidth = Math.random() * 0.1 + 0.05;
                    var boxHeight = Math.random() * 0.05 + 0.01;
                    var topA = matrix_1.add([ax, cornerAHeight - boxHeight, ay], matrix_1.scale(boxStart, wallDir));
                    var botA = matrix_1.add([ax, 8, ay], matrix_1.scale(boxStart, wallDir));
                    var up = [0, -1, 0];
                    var color = stoneColor();
                    var addQuad = function (a, b, d, draw) {
                        if (draw === void 0) { draw = color; }
                        addTriangle(b, a, matrix_1.add(a, d), { vertexColor: draw }, "cliff");
                        addTriangle(b, matrix_1.add(a, d), matrix_1.add(b, d), { vertexColor: draw }, "cliff");
                    };
                    // front
                    addQuad(matrix_1.add(topA, matrix_1.scale(boxWidth / 2, outDir), matrix_1.scale(boxHeight, up)), matrix_1.add(botA, matrix_1.scale(boxWidth / 2, outDir)), matrix_1.scale(boxLength, wallDir));
                    // side 1
                    addQuad(matrix_1.add(botA, matrix_1.scale(-boxWidth / 2, outDir)), matrix_1.add(topA, matrix_1.scale(-boxWidth / 2, outDir), matrix_1.scale(boxHeight, up)), matrix_1.scale(boxLength, wallDir));
                    // side 2
                    addQuad(matrix_1.add(topA, matrix_1.scale(-boxWidth / 2, outDir), matrix_1.scale(boxHeight, up)), matrix_1.add(botA, matrix_1.scale(-boxWidth / 2, outDir)), matrix_1.scale(boxWidth, outDir));
                    // back
                    addQuad(matrix_1.add(botA, matrix_1.scale(-boxWidth / 2, outDir), matrix_1.scale(boxLength, wallDir)), matrix_1.add(topA, matrix_1.scale(-boxWidth / 2, outDir), matrix_1.scale(boxHeight, up), matrix_1.scale(boxLength, wallDir)), matrix_1.scale(boxWidth, outDir));
                    // top
                    addQuad(matrix_1.add(topA, matrix_1.scale(-boxWidth / 2, outDir), matrix_1.scale(boxHeight, up), matrix_1.scale(boxLength, wallDir)), matrix_1.add(topA, matrix_1.scale(-boxWidth / 2, outDir), matrix_1.scale(boxHeight, up)), matrix_1.scale(boxWidth, outDir), grassColor);
                };
                for (var j = 0; j < 2; j++) {
                    _loop_4(j);
                }
                var _loop_5 = function (j) {
                    var wallDifference = matrix_1.subtract([bx, cornerBHeight, by], [ax, cornerAHeight, ay]);
                    var wallDir = matrix_1.scale(1 / matrix_1.magnitude([wallDifference[0], 0, wallDifference[2]]), wallDifference);
                    var outDir = matrix_1.unit([wallDir[2], 0, -wallDir[0]]);
                    var wallLength = matrix_1.magnitude([wallDifference[0], 0, wallDifference[2]]);
                    var boxLength = Math.random() * 0.2 + 0.25;
                    var boxStart = Math.random() * (wallLength - boxLength);
                    var boxWidth = Math.random() * 0.2 + 0.2;
                    var boxHeight = -Math.random() * 1 - 0.15;
                    var topA = matrix_1.add([ax, cornerAHeight - boxHeight, ay], matrix_1.scale(boxStart, wallDir));
                    var botA = matrix_1.add([ax, 8, ay], matrix_1.scale(boxStart, wallDir));
                    var up = [0, -1, 0];
                    var color = stoneColor(0.75);
                    var addQuad = function (a, b, d, draw) {
                        if (draw === void 0) { draw = color; }
                        addTriangle(b, a, matrix_1.add(a, d), { vertexColor: draw }, "cliff");
                        addTriangle(b, matrix_1.add(a, d), matrix_1.add(b, d), { vertexColor: draw }, "cliff");
                    };
                    // front
                    addQuad(matrix_1.add(topA, matrix_1.scale(boxWidth / 2, outDir), matrix_1.scale(boxHeight, up)), matrix_1.add(botA, matrix_1.scale(boxWidth / 2, outDir)), matrix_1.scale(boxLength, wallDir));
                    // side 1
                    addQuad(matrix_1.add(botA, matrix_1.scale(-boxWidth / 2, outDir)), matrix_1.add(topA, matrix_1.scale(-boxWidth / 2, outDir), matrix_1.scale(boxHeight, up)), matrix_1.scale(boxLength, wallDir));
                    // side 2
                    addQuad(matrix_1.add(topA, matrix_1.scale(-boxWidth / 2, outDir), matrix_1.scale(boxHeight, up)), matrix_1.add(botA, matrix_1.scale(-boxWidth / 2, outDir)), matrix_1.scale(boxWidth, outDir));
                    // back
                    addQuad(matrix_1.add(botA, matrix_1.scale(-boxWidth / 2, outDir), matrix_1.scale(boxLength, wallDir)), matrix_1.add(topA, matrix_1.scale(-boxWidth / 2, outDir), matrix_1.scale(boxHeight, up), matrix_1.scale(boxLength, wallDir)), matrix_1.scale(boxWidth, outDir));
                    // top
                    addQuad(matrix_1.add(topA, matrix_1.scale(-boxWidth / 2, outDir), matrix_1.scale(boxHeight, up), matrix_1.scale(boxLength, wallDir)), matrix_1.add(topA, matrix_1.scale(-boxWidth / 2, outDir), matrix_1.scale(boxHeight, up)), matrix_1.scale(boxWidth, outDir));
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
                    addTriangle([clumpX - lx, clumpH + 0.1, clumpY - ly], [clumpX - ox + lx, clumpH - oh, clumpY - oy + ly], [clumpX + ox + lx, clumpH - oh, clumpY + oy + ly], { vertexColor: bladeColor });
                    addTriangle([clumpX - ox + lx, clumpH - oh, clumpY - oy + ly], [clumpX + 3 * lx, clumpH - oh * 2, clumpY + 3 * ly], [clumpX + ox + lx, clumpH - oh, clumpY + oy + ly], { vertexColor: bladeColor });
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
                for (var s = 0; s < 5; s++) {
                    var h = r;
                    var d = 0.02;
                    addTriangle([rockX + Math.cos(s / 5 * Math.PI * 2) * r, rockH + d, rockY + Math.sin(s / 5 * Math.PI * 2) * r], [rockX, rockH - h, rockY], [rockX + Math.cos((s + 1) / 5 * Math.PI * 2) * r, rockH + d, rockY + Math.sin((s + 1) / 5 * Math.PI * 2) * r], { vertexColor: hexColor.map(function (x) { return x * 0.3 + 0.6; }) }, "rock");
                }
            }
            if (Math.random() < 1 / 1000) {
                // add a city
                // first add a large central tower
                var color_1 = [0.95, 0.85, 0.75];
                var addPillar = function (corners, options) {
                    var count = options.count, base = options.base;
                    var step = 1 / count;
                    for (var h = 0; h <= 1; h += step) {
                        var _loop_6 = function (i_2) {
                            var f1 = function (t) { return options.peak && t >= 1 ? options.peak : corners[i_2](t); };
                            var f2 = function (t) { return options.peak && t >= 1 ? options.peak : corners[(i_2 + 1) % corners.length](t); };
                            addTriangle(matrix_1.add(base, f2(h)), matrix_1.add(base, f1(h)), matrix_1.add(base, f2(h + step)), {
                                vertexColor: color_1,
                                vertexBanding: 0
                            }, "tower");
                            addTriangle(matrix_1.add(base, f2(h + step)), matrix_1.add(base, f1(h)), matrix_1.add(base, f1(h + step)), {
                                vertexColor: color_1,
                                vertexBanding: 0
                            }, "tower");
                        };
                        for (var i_2 = 0; i_2 < corners.length; i_2++) {
                            _loop_6(i_2);
                        }
                    }
                };
                var _d = hexToWorld(p), wx_1 = _d.wx, wy_1 = _d.wy;
                var reheight_1 = function (h) { return -h * 0.25; };
                var mainHeight_1 = reheight_1(world.heightMap.get(p));
                var center = [wx_1, mainHeight_1, wy_1];
                var corners_1 = [
                    function (h) { return h >= 1 ? [0, -h * 1.0, 0] : [+0.4 / (2 * h + 1), -h * 0.7, +0.1 / (h + 1)]; },
                    function (h) { return h >= 1 ? [0, -h * 1.0, 0] : [-0.1 / (h + 1), -h * 0.7, +0.1 / (h + 1)]; },
                    function (h) { return h >= 1 ? [0, -h * 1.0, 0] : [-0.1 / (h + 1), -h * 0.7, -0.1 / (h + 1)]; },
                    function (h) { return h >= 1 ? [0, -h * 1.0, 0] : [+0.05 / (h + 1), -h * 0.7, -0.1 / (h + 1)]; },
                ].map(function (f) { return function (x) { return matrix_1.multiply([0.5, 1, 0.5], f(x)); }; });
                addPillar(corners_1, { base: center, count: 5 });
                var _loop_7 = function (i_3) {
                    var height = 0.4 + (i_3 * 2 % 5) / 12;
                    var cs_1 = [
                        function (h) { return matrix_1.multiply([+0.03, -h * height, -0.03], Math.abs(h - 0.5) < 0.2 / height ? [1, 1, 1] : [2, 1, 2]); },
                        function (h) { return matrix_1.multiply([+0.03, -h * height, +0.03], Math.abs(h - 0.5) < 0.2 / height ? [1, 1, 1] : [2, 1, 2]); },
                        function (h) { return matrix_1.multiply([-0.03, -h * height, +0.00], Math.abs(h - 0.5) < 0.2 / height ? [1, 1, 1] : [2, 1, 2]); },
                    ];
                    addPillar(cs_1, {
                        count: 4,
                        base: matrix_1.add(center, [Math.cos(i_3 / 5 * Math.PI * 2 - 0.5) * 0.2, 0, Math.sin(i_3 / 5 * Math.PI * 2 - 0.5) * 0.2]),
                        peak: [0, -(0.4 + (i_3 * 3 % 5) / 12), 0]
                    });
                };
                for (var i_3 = 0; i_3 < 5; i_3++) {
                    _loop_7(i_3);
                }
                var _loop_8 = function (i_4) {
                    var t = i_4 / 10;
                    var tw = 0.023;
                    var th = 0.25;
                    var top_1 = 0.15;
                    var r = 0.45;
                    if (i_4 % 2 == 0) {
                        top_1 *= 2;
                        tw *= 2;
                        th *= 0.4;
                        r *= 1.09;
                    }
                    var angle = Math.PI * 2 * t;
                    // vectors
                    var out = [Math.cos(angle), 0, Math.sin(angle)];
                    var right = [-Math.sin(angle), 0, Math.cos(angle)];
                    var cs_2 = [
                        function (h) { return matrix_1.add([0, -h * top_1, 0], matrix_1.scale(tw, out), matrix_1.scale(th, right)); },
                        function (h) { return matrix_1.add([0, -h * top_1, 0], matrix_1.scale(-tw, out), matrix_1.scale(th, right)); },
                        function (h) { return matrix_1.add([0, -h * top_1, 0], matrix_1.scale(-tw, out), matrix_1.scale(-th, right)); },
                        function (h) { return matrix_1.add([0, -h * top_1, 0], matrix_1.scale(tw, out), matrix_1.scale(-th, right)); },
                    ];
                    addPillar(cs_2, {
                        count: 2,
                        base: matrix_1.add(center, [Math.cos(angle) * r, 0, Math.sin(angle) * r]),
                        peak: [0, -top_1 * 1 / 2, 0]
                    });
                };
                for (var i_4 = 0; i_4 < 10; i_4++) {
                    _loop_8(i_4);
                }
            }
        };
        for (var i = 0; i < 6; i++) {
            _loop_3(i);
        }
    };
    for (var _i = 0, _a = world.heightMap.cells(); _i < _a.length; _i++) {
        var p = _a[_i];
        _loop_2(p);
    }
    function perspectiveMatrices(options) {
        // TODO: allow roll
        var near = options.near, far = options.far, zoom = options.zoom, from = options.from, to = options.to;
        var forward = matrix_1.unit(matrix_1.subtract(from, to));
        var right = matrix_1.unit(matrix_1.cross(forward, [0, 1, 0]));
        var up = matrix_1.cross(forward, right);
        return {
            perspective: [
                zoom, 0, 0, 0,
                0, zoom, 0, 0,
                0, 0, (near + far) / (near - far), -1,
                0, 0, near * far / (near - far) * 2, 0,
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
            ]
        };
    }
    // let's smooth the normals
    var normalSmoother = new matrix_1.PointMap(0.01, function () { return []; });
    for (var _b = 0, meshTriangles_1 = meshTriangles; _b < meshTriangles_1.length; _b++) {
        var triangle = meshTriangles_1[_b];
        if (triangle.metadata.group != "surface") {
            continue;
        }
        for (var _c = 0, _d = triangle.vertices; _c < _d.length; _c++) {
            var vertex = _d[_c];
            // this is a little odd
            normalSmoother.get(vertex.vertexPosition).push(vertex.vertexNormal);
        }
    }
    // smooth the normals:
    for (var _e = 0, meshTriangles_2 = meshTriangles; _e < meshTriangles_2.length; _e++) {
        var triangle = meshTriangles_2[_e];
        if (triangle.metadata.group != "surface") {
            continue;
        }
        for (var _f = 0, _g = triangle.vertices; _f < _g.length; _f++) {
            var vertex = _g[_f];
            vertex.vertexNormal = matrix_1.unit(matrix_1.add.apply(void 0, normalSmoother.get(vertex.vertexPosition)));
        }
    }
    exports.glacier.bufferTriangles(meshTriangles.map(function (x) { return x.vertices; }));
    var onlyPosition = meshTriangles.map(function (triangle) { return triangle.vertices.map(function (vertex) { return ({ vertexPosition: vertex.vertexPosition }); }); });
    exports.shadowGlacier.bufferTriangles(onlyPosition); // slices to only take vertexPosition
    waterGlacier.bufferTriangles([
        [{ vertexPosition: [-90, 1, -90] }, { vertexPosition: [90, 1, -90] }, { vertexPosition: [90, 1, 90] }],
        [{ vertexPosition: [-90, 1, -90] }, { vertexPosition: [-90, 1, 90] }, { vertexPosition: [90, 1, 90] }],
    ]); // slices to only take vertexPosition
    var meanCenter = function () {
        var sum = { x: 0, y: 0 };
        for (var _i = 0, _a = world.heightMap.cells(); _i < _a.length; _i++) {
            var tile = _a[_i];
            sum.x += hexToWorld(tile).wx;
            sum.y += hexToWorld(tile).wy;
        }
        sum.x /= world.heightMap.cells().length;
        sum.y /= world.heightMap.cells().length;
        return [sum.x, 0, sum.y];
    }();
    var cameraFocus = function () {
        var sum = { x: 0, y: 0 };
        for (var _i = 0, _a = world.heightMap.cells(); _i < _a.length; _i++) {
            var tile = _a[_i];
            sum.x += hexToWorld(tile).wx;
            sum.y += hexToWorld(tile).wy;
        }
        sum.x /= world.heightMap.cells().length;
        sum.y /= world.heightMap.cells().length;
        return sum;
    }();
    var cameraZoom = -1;
    var cameraViewAngle = 0;
    var mouseStart = { x: 0, y: 0 };
    var isDown = false;
    var mouseEnd = { x: 0, y: 0 };
    var mouseLast = { x: 0, y: 0 };
    var mouseCurrent = { x: 0, y: 0 };
    function computeCameraDistance() {
        return 5 / Math.pow(2, cameraZoom) + 3;
    }
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
            cameraZoom = utility_3.clamp(-2, cameraZoom, 2.5);
        }
        mouseLast = mouseCurrent;
    }, false);
    document.addEventListener("mouseup", function (e) {
        isDown = false;
        mouseEnd = mouseCurrent;
    }, false);
    var touchData = {};
    canvas.addEventListener('touchstart', function (e) {
        e.preventDefault();
        for (var i = 0; i < e.changedTouches.length; i++) {
            var started = e.changedTouches.item(i);
            touchData[started.identifier] = {
                start: { x: started.clientX - canvas.clientLeft, y: started.clientY - canvas.clientTop },
                last: { x: started.clientX - canvas.clientLeft, y: started.clientY - canvas.clientTop }
            };
        }
    });
    canvas.addEventListener('touchend', function (e) {
        e.preventDefault();
        for (var i = 0; i < e.changedTouches.length; i++) {
            var ended = e.changedTouches.item(i);
            delete touchData[ended.identifier];
        }
    });
    canvas.addEventListener('touchmove', function (e) {
        var speed = 0.003 * computeCameraDistance();
        for (var i = 0; i < e.changedTouches.length; i++) {
            var changed = e.changedTouches.item(i);
            if (changed && changed.identifier in touchData) {
                var data = touchData[changed.identifier];
                var position = { x: changed.clientX - canvas.clientLeft, y: changed.clientY - canvas.clientTop };
                var delta = { x: position.x - data.last.x, y: position.y - data.last.y };
                var cameraRegion = function (_a) {
                    var x = _a.x, y = _a.y;
                    var border = 0.15;
                    var minusBorder = 1 - border;
                    return x < canvas.offsetWidth * border || x > canvas.offsetHeight * (1 - border) || y < canvas.offsetHeight * border || y > canvas.offsetHeight * (1 - border);
                };
                if (cameraRegion(data.start)) {
                    // move the world
                    cameraFocus.x += Math.sin(cameraViewAngle) * delta.x * speed;
                    cameraFocus.y -= Math.cos(cameraViewAngle) * delta.x * speed;
                    cameraFocus.x -= Math.cos(cameraViewAngle) * delta.y * speed;
                    cameraFocus.y -= Math.sin(cameraViewAngle) * delta.y * speed;
                }
                else {
                    // move the camera
                    cameraViewAngle -= delta.x * 0.01;
                    cameraZoom -= delta.y * 0.01;
                    cameraZoom = utility_3.clamp(-2, cameraZoom, 2.5);
                }
                data.last = position;
            }
        }
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
        var cameraDistance = computeCameraDistance();
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
            -cameraDistance,
            Math.sin(cameraViewAngle) * cameraDistance + cameraFocus.y,
        ];
        var to = [
            cameraFocus.x,
            0,
            cameraFocus.y,
        ];
        var forward = matrix_1.unit(matrix_1.subtract(from, to));
        var right = matrix_1.unit(matrix_1.cross(forward, [0, 1, 0]));
        var up = matrix_1.cross(forward, right);
        var _a = perspectiveMatrices({ near: 0.1, far: 80, zoom: 2, from: from, to: to }), perspective = _a.perspective, camera = _a.camera, cameraPosition = _a.cameraPosition;
        var shadowSource = matrix_1.add(meanCenter, matrix_1.scale(70, lightDirection));
        var shadowScale = 100;
        var shadowZoom = 2;
        var _b = perspectiveMatrices({ near: 0.1, far: shadowScale + 1, zoom: shadowZoom, from: shadowSource, to: meanCenter }), shadowPerspective = _b.perspective, shadowCamera = _b.camera, shadowCameraPosition = _b.cameraPosition;
        exports.shadowGlacier.activate();
        exports.shadowGlacier.setUniform({
            perspective: shadowPerspective,
            camera: shadowCamera,
            cameraPosition: shadowCameraPosition,
            shadowSource: shadowSource,
            shadowScale: shadowScale
        });
        exports.shadowGlacier.draw({ clearColor: [1, 1, 1] });
        exports.shadowGlacier.deactivate();
        exports.glacier.activate();
        if (window.debug_shadow) {
            perspective = shadowPerspective;
            camera = shadowCamera;
            cameraPosition = shadowCameraPosition;
        }
        exports.glacier.setUniform({
            perspective: perspective,
            camera: camera,
            cameraPosition: cameraPosition,
            lightDirection: lightDirection,
            shadowMap: { index: 0, texture: glacial_1.getGlacialTexture(exports.shadowGlacier) },
            shadowPerspective: shadowPerspective,
            shadowCamera: shadowCamera,
            shadowCameraPosition: shadowCameraPosition,
            shadowSource: shadowSource,
            shadowScale: shadowScale,
            noiseTexture: { index: 1, texture: noiseTexture }
        });
        exports.glacier.draw({ clearColor: [0, 0, 0] });
        exports.glacier.deactivate();
        waterGlacier.activate();
        waterGlacier.setUniform({
            perspective: perspective,
            camera: camera,
            cameraPosition: cameraPosition,
            eyeLocation: from,
            lightDirection: lightDirection,
            noiseTexture: { index: 1, texture: noiseTexture },
            time: (Date.now() / 10000) % 1000,
            shadowPerspective: shadowPerspective,
            shadowCamera: shadowCamera,
            shadowCameraPosition: shadowCameraPosition,
            shadowScale: shadowScale,
            shadowSource: shadowSource,
            shadowMap: { index: 0, texture: glacial_1.getGlacialTexture(exports.shadowGlacier) }
        });
        waterGlacier.draw({ clearColor: "no-clear" });
        waterGlacier.deactivate();
    }
    loop();
});
//# sourceMappingURL=build.js.map