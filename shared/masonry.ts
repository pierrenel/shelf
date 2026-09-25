export function masonry(sizes: {
    width: number;
    height: number;
}[], container: number, gap = 20) {
    const columns = Math.max(1, Math.floor((container + gap) / (280 + gap)));
    const width = Math.max(1, (container - gap * (columns - 1)) / columns);
    const heights = Array<number>(columns).fill(0);
    const positions = sizes.map(size => {
        const column = heights.indexOf(Math.min(...heights));
        const height = width * size.height / Math.max(1, size.width) + 100;
        const position = { left: column * (width + gap), top: heights[column], width, height };
        heights[column] += height + gap;
        return position;
    });
    return { positions, height: Math.max(0, ...heights) - (sizes.length ? gap : 0) };
}
