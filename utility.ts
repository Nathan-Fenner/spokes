

export function randomChoose<T>(xs: T[]): T {
    return xs[Math.random() * xs.length|0];
}

export function clamp(low: number, value: number, high: number): number {
    return Math.min(high, Math.max(low, value));
}

export function range(xs: number[]): number {
    return Math.max(...xs) - Math.min(...xs);
}

export function middle(xs: number[]): number {
    return (Math.max(...xs) + Math.min(...xs)) / 2;
}

export function median(xs: number[]): number {
    let ys = xs.slice(0).sort();
    if (ys.length % 2 == 0) {
        return (ys[ys.length/2-1] + ys[ys.length/2]) / 2;
    }
    return ys[ys.length/2 | 0];
}

export function distinct<A>(xs: A[]): boolean {
    for (let i = 0; i < xs.length; i++) {
        for (let j = 0; j < i; j++) {
            if (xs[i] == xs[j]) {
                return false;
            }
        }
    }
    return true;
}
