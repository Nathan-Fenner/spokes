
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
    capitol: HexPos,
};

let usedTerritories: Territory[] = [];
let nations: Nation[] = [];
for (let p of mass) {
    let territory = territoryMap[hexKey(p)];
    if (usedTerritories.indexOf(territory) == -1) {
        usedTerritories.push(territory);
        let capitol = territory.cells[Math.random() * territory.cells.length | 0];
        let color = "#F00";
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
            color = "#FF0";
            capitol = nonBorder[Math.random() * nonBorder.length | 0];
        }
        nations.push({
            cells: territory.cells,
            color,
            capitol,
        });
    }
}

// nations have an owner (which is a player)

// the goal of the game's design is to make a 4X game where rapidly expanding in the early game is a bad strategy.
// in particular, long-term harmony with your neighbors should be your best strategy.

// nations are mostly separate (even under the same empire), to simplify gameplay and design

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
    for (let nation of nations) {
        ctx.fillStyle = "#FFF";
        fillHexCell(nation.capitol, 1.2);
        ctx.fillStyle = nation.color;
        fillHexCell(nation.capitol, 0.9);

        ctx.fillStyle = "#F00";
        fillHexCell(hexOffset(nation.capitol, 1, 0), 0.5);
        ctx.fillStyle = "#FF0";
        fillHexCell(hexOffset(nation.capitol, 1, 1), 0.5);
        ctx.fillStyle = "#00F";
        fillHexCell(hexOffset(nation.capitol, 0, 1), 0.5);
    }
    window.requestAnimationFrame(drawWorld);
}

drawWorld();