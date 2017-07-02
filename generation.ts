
import { randomChoose, clamp } from './utility';

export class HexPos {
    readonly hx: number;
    readonly hy: number;
    constructor(hx: number, hy: number) {
        this.hx = hx;
        this.hy = hy;
    }
    neighbors() {
        let result = [];
        for (let {dx, dy} of [{dx: 1, dy: 0}, {dx: 1, dy: 1}, {dx: 0, dy: 1}, {dx: -1, dy: 0}, {dx: -1, dy: -1}, {dx: 0, dy: -1}]) {
            result.push(new HexPos(this.hx + dx, this.hy + dy));
        }
        return result
    }
}

let hexOrigin: HexPos = new HexPos(0, 0);

// export type HexPos = {hx: number, hy: number};

export type GenerationParameters = {
    avoiderCount: number,
    tileCount: number,
    smoothness: number,
};

let generationParameters: GenerationParameters = {
    avoiderCount: Math.random() * 200 | 0,
    tileCount: Math.random() * 500 + 750 | 0,
    smoothness: Math.random()**2 * 60,
};

function hexToKey(cell: HexPos): string {
    return cell.hx + "H" + cell.hy;
}

function keyToHex(cell: string): HexPos {
    return new HexPos(parseInt(cell.split("H")[0]), parseInt(cell.split("H")[1]));
}


export function hexDistance(p: HexPos, q: HexPos): number {
    if (p.hx == q.hx || p.hy == q.hy) {
        return Math.abs(p.hx - q.hx) + Math.abs(p.hy - q.hy);
    }
    if ((p.hx - q.hx < 0) == (p.hy - q.hy < 0)) {
        return Math.max(Math.abs(p.hx - q.hx), Math.abs(p.hy - q.hy));
    }
    return Math.abs(p.hx - q.hx) + Math.abs(p.hy - q.hy);
}

export type HexMapKey<NAME> = HexPos & "ReallyIndexable" & {dont_use_this_aspect_at_all: NAME};

export class HexMap<NAME, T> {
    underlying: {[key: string]: T};
    constructor() {
        this.underlying = {};
    }
    contains(h: HexPos): h is HexMapKey<NAME> {
        return hexToKey(h) in this.underlying;
    }
    set(h: HexPos, v: T) {
        this.underlying[hexToKey(h)] = v;
    }
    get(h: HexMapKey<NAME>): T {
        return this.underlying[hexToKey(h)];
    }
    getOr(h: HexMapKey<NAME>, otherwise: T): T {
        if (this.contains(h)) {
            return this.get(h);
        }
        return otherwise;
    }
    cells(): HexMapKey<NAME>[] {
        let out: HexMapKey<NAME>[] = [];
        for (let cell in this.underlying) {
            out.push(keyToHex(cell) as HexMapKey<NAME>);
        }
        return out;
    }
};

export function generateMap() {
    let mass: HexPos[] = [hexOrigin];
    let massMap = new HexMap<"mass", boolean>();
    massMap.set(hexOrigin, true);
    type Avoider = {p: HexPos, r: number};
    let avoiders: Avoider[] = [];

    for (let i = 0; i < generationParameters.avoiderCount; i++) {
        avoiders.push({
            p: new HexPos(Math.random()*100 - 50, Math.random()*100 - 50),
            r: Math.random()**2 * 5 + 2,
        });
    }

    while (mass.length < generationParameters.tileCount) {
        let from = randomChoose(mass);
        let neighbor = randomChoose(from.neighbors());
        if (massMap.contains(neighbor)) {
            continue;
        }
        let reject = 0;
        for (let avoider of avoiders) {
            reject = Math.max(reject, avoider.r - 2*hexDistance(neighbor, avoider.p)**0.5);
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

    let heightMap = new HexMap<"height", number>();
    heightMap.set(hexOrigin, 2);

    while (1) {
        let unassigned: {p: HexPos, v: number}[] = [];
        for (let p of mass) {
            if (heightMap.contains(p)) {
                continue;
            }
            for (let n of p.neighbors()) {
                if (heightMap.contains(n)) {
                    unassigned.push({p, v: heightMap.get(n)});
                }
            }
        }
        if (unassigned.length == 0) {
            break;
        }
        let choice = randomChoose(unassigned);
        heightMap.set(choice.p, clamp(0, choice.v + (Math.random()*100 < generationParameters.smoothness ? 0 : randomChoose([1, -1])), 8));
    }
    // Great! We're getting there.
    let tiles = heightMap.cells();

    // Now, we smooth the result to eliminate areas of varying height with no strategic value.
    for (let i = 0; i < 10; i++) {
        for (let j = 0; j < tiles.length; j++) {
            let tile = tiles[j];
            let h = heightMap.get(tile);
            let forbid = [];
            let neighbor = [];
            for (let n of tile.neighbors()) {
                if (heightMap.contains(n) && Math.abs(heightMap.get(n) - h) <= 2) {
                    neighbor.push(heightMap.get(n));
                }
            }
            let countH0 = neighbor.filter((x) => x == h).length;
            let countHU = neighbor.filter((x) => x == h+1).length;
            let countHD = neighbor.filter((x) => x == h-1).length;
            // this may create new connections, but it won't destroy existing ones
            if (neighbor.indexOf(h+1) < 0 && countHD > countH0) {
                heightMap.set(tile, h - 1);
            }
            if (neighbor.indexOf(h-1) < 0 && countHU > countH0) {
                heightMap.set(tile, h + 1);
            }
        }
    }
    return {
        heightMap,
        // TODO: other world features
    };
}
