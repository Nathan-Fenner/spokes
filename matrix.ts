
import { randomChoose } from './utility'

export type Vec2 = [number, number];
export type Vec3 = [number, number, number];
export type Vec4 = [number, number, number, number];
export type Mat4 = [
    number, number, number, number,
    number, number, number, number,
    number, number, number, number,
    number, number, number, number
];
export type VecN = [null, number, Vec2, Vec3, Vec4]; // TODO: more
export type VecLength = 0 | 1 | 2 | 3; // attributes allows


export function cross(u: Vec3, v: Vec3): Vec3 {
    return [u[1]*v[2] - u[2]*v[1], u[2]*v[0] - u[0]*v[2], u[0]*v[1] - u[1]*v[0]];
}
export function subtract(u: Vec3, v: Vec3): Vec3 {
    return [u[0] - v[0], u[1] - v[1], u[2] - v[2]];
}
export function add(...us: Vec3[]): Vec3 {
    let sum: Vec3 = [0, 0, 0];
    for (let u of us) {
        sum[0] += u[0];
        sum[1] += u[1];
        sum[2] += u[2];
    }
    return sum;
}
export function multiply(...us: Vec3[]): Vec3 {
    let sum: Vec3 = [1, 1, 1];
    for (let u of us) {
        sum[0] *= u[0];
        sum[1] *= u[1];
        sum[2] *= u[2];
    }
    return sum;
}
export function plus(u: Vec3, v: Vec3): Vec3 {
    return add(u, v);
}
export function scale(k: number, v: Vec3): Vec3 {
    return [k*v[0], k*v[1], k*v[2]];
}
export function dot(a: Vec3, b: Vec3): number {
    let s = 0;
    s += a[0] * b[0];
    s += a[1] * b[1];
    s += a[2] * b[2];
    return s;
}
export function magnitude(v: Vec3): number {
    return Math.sqrt(v[0]**2 + v[1]**2 + v[2]**2);
}
export function distance(v: Vec3, u: Vec3): number {
    return magnitude(subtract(v, u));
}
export function unit(v: Vec3): Vec3 {
    return scale(1 / magnitude(v), v);
}

// TODO: integrate vertices with programs (arbitrary attributes etc.)

export type AttributeType = "vec3" | "vec4" | "mat4";

type AttributeMap = {
    vec3: Vec3,
    vec4: null,
    mat4: Mat4,
};

type PointTree = null | {dimension: 0 | 1 | 2, pivot: Vec3, low: PointTree, high: PointTree};

function find(tree: PointTree, point: Vec3, epsilon: number): Vec3 | null {
    let stack: PointTree[] = [tree];
    while (stack.length > 0) {
        let branch: PointTree = stack.pop()!;
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
function insert(tree: PointTree, point: Vec3): PointTree {
    if (tree == null) {
        return {pivot: point, low: null, high: null, dimension: randomChoose<0|1|2>([0, 1, 2])};
    }
    if (point[tree.dimension] < tree.pivot[tree.dimension]) {
        tree.low = insert(tree.low, point);
    } else {
        tree.high = insert(tree.high, point);
    }
    return tree;
}

export class PointBunch {
    identify(p: Vec3): string {
        let found = find(this.tree, p, this.epsilon);
        if (found) {
            return "$" + this.id + found.join(",");
        }
        this.tree = insert(this.tree, p);
        return "$" + this.id + p.join(",");
    }
    private id: string;
    private tree: PointTree;
    private epsilon: number;
    constructor(epsilon: number) {
        this.id = ("" + Math.random()).substr(2,3);
        this.tree = null;
        this.epsilon = epsilon;
    }
}
export class PointMap<T> {
    get(p: Vec3): T {
        let id = this.bunch.identify(p);
        if (id in this.map) {
            return this.map[id];
        }
        return this.map[id] = this.maker();
    }
    put(p: Vec3, value: T) {
        let id = this.bunch.identify(p);
        this.map[id] = value;
    }
    constructor(epsilon: number, maker: () => T) {
        this.maker = maker;
        this.map = {};
        this.bunch = new PointBunch(epsilon);
    }
    private maker: () => T;
    private map: {[k: string]: T};
    private bunch: PointBunch;
}
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