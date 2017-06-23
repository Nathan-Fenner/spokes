
let canvas = document.getElementById("canvas") as HTMLCanvasElement;
canvas.width = 900;
canvas.height = 600;
let ctx = canvas.getContext("2d") as CanvasRenderingContext2D;

// build a hex grid

function randomChoose<T>(xs: T[]): T {
    return xs[Math.random() * xs.length|0];
}

type HexPos = {hx: number, hy: number};
type WorldPos = {wx: number, wy: number};

function hex_to_world(pos: {hx: number, hy: number}) {
    let {hx, hy} = pos;
    return {wx: hx * 7/8, wy: hx*1/2 - hy*Math.sqrt(3)/2};
}

function hex_key(cell: HexPos): string {
    return cell.hx + "H" + cell.hy;
}

function hex_neighbors(p: HexPos): HexPos[] {
    let result = [];
    for (let {dx, dy} of [{dx: 1, dy: 0}, {dx: 1, dy: 1}, {dx: 0, dy: 1}, {dx: -1, dy: 0}, {dx: -1, dy: -1}, {dx: 0, dy: -1}]) {
        result.push({hx: p.hx + dx, hy: p.hy + dy});
    }
    return result
}

function hex_dist(p: HexPos, q: HexPos): number {
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
let mass_set: {[k: string]: boolean} = {"0,0": true};
type Avoider = HexPos & {r: number};
let avoiders: Avoider[] = [];

let avoider_count = Math.random() * 200;
for (let i = 0; i < avoider_count; i++) {
    avoiders.push({
        hx: Math.random() * 100 - 50,
        hy: Math.random() * 100 - 50,
        r: Math.random() * 5 + 2,
    });
}

while (mass.length < 1000) {
    let from = mass[Math.random()*mass.length|0];
    let neighbor = hex_neighbors(from)[Math.random()*6|0];
    let signature = neighbor.hx + "," + neighbor.hy;
    if (signature in mass_set) {
        continue;
    }
    let reject = 0;
    for (let avoider of avoiders) {
        reject = Math.max(reject, avoider.r - 2 * hex_dist(neighbor, avoider) ** 0.5);
    }
    // 0.9 is the fuzziness parameter.
    // if it's higher, borders become sharper but more regular
    // if it's much lower, borders completely disappear
    if (Math.random() < 0.9 && Math.random() < reject) {
        continue;
    }
    mass.push(neighbor);
    mass_set[signature] = true;
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
    territoryMap[hex_key(cell)] = {
        id: hex_key(cell),
        cells: [cell],
        color: randomChoose(["#083", "#093", "#007B33", "#A94", "#983", "#AAC"]),
    };
    territories.push(territoryMap[hex_key(cell)]);
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
        let neighbor = randomChoose(hex_neighbors(contained));
        if (territoryMap[hex_key(neighbor)] && territoryMap[hex_key(neighbor)] != smallestTerritory) {
            neighboringTerritory = territoryMap[hex_key(neighbor)];
        }
    }
    // merge the two
    for (let cell of smallestTerritory.cells) {
        territoryMap[hex_key(cell)] = neighboringTerritory;
        neighboringTerritory.cells.push(cell);
    }
}


// suppose we just merged adjacent nations of the same color
// this would lead to interesting variations in size and shape, and simplify border presentation

for (let p of mass) {
    for (let n of hex_neighbors(p)) {
        if (hex_key(n) in territoryMap && territoryMap[hex_key(n)] != territoryMap[hex_key(p)] && territoryMap[hex_key(p)].color == territoryMap[hex_key(n)].color) {
            // merge the territories
            let original = territoryMap[hex_key(p)];
            let merged = territoryMap[hex_key(n)];
            for (let q of mass) {
                if (territoryMap[hex_key(q)] == merged) {
                    territoryMap[hex_key(q)] = original;
                    original.cells.push(q);
                }
            }
        }
    }
}

// with overwhelming likelihood, there are at least two nations.
// we can ignore the case where this is not true (for now; I want to handle it eventually)

let nations: Territory[] = [];
for (let p of mass) {
    let nation = territoryMap[hex_key(p)];
    if (nations.indexOf(nation) == -1) {
        nations.push(nation);
    }
}

// nations have an owner (which is a player)

// the goal of the game's design is to make a 4X game where rapidly expanding in the early game is a bad strategy.
// in particular, long-term harmony with your neighbors should be your best strategy.

// nations are mostly separate (even under the same empire), to simplify gameplay and design



ctx.fillStyle = "#257";
ctx.fillRect(0, 0, canvas.width, canvas.height);
let stripeHeight = 6;
for (let stripe = 0; stripe < canvas.height; stripe += stripeHeight*2) {
    ctx.fillStyle = "#194969";
    ctx.fillRect(0, stripe, canvas.width, stripeHeight);
}

let scale = 12;
let size = (scale * 0.876 + 1) | 0;
let shape = 1;
for (let p of mass) {
    let d = hex_to_world(p);
    ctx.fillStyle = territoryMap[hex_key(p)].color;
    ctx.fillRect(canvas.width/2 + d.wx*scale - size/2 | 0, canvas.height/2 + d.wy*scale - size*shape/2 | 0, size, size*shape);
}