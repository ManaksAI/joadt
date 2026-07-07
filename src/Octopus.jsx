// The JoadT mark — a minimal monochrome pixel octopus, drawn from a char-map so it
// stays crisp at any size. The eight arms are the tentacles.
const MAP = [
  "                ",
  "      BBBB      ",
  "     BBBBBB     ",
  "    BBBBBBBB    ",
  "   BWWBBBBWWB   ",
  "   BWPBBBBPWB   ",
  "   BBBBBBBBBB   ",
  "  BBBBBBBBBBBB  ",
  " BBBBBBBBBBBBBB ",
  " BB BB BB BB BB ",
  " BB BB BB BB BB ",
  " DD DD DD DD DD ",
  "D   D   D  D   D",
  "                ",
];
const C = { B: "#6A6E77", D: "#50535B", W: "#E9E9E7", P: "#2C2C2A" };

export default function Octopus({ size = 88 }) {
  const rects = [];
  MAP.forEach((line, r) => {
    for (let c = 0; c < 16; c++) {
      const fill = C[line[c]];
      if (fill) rects.push(<rect key={`${r}-${c}`} x={c} y={r} width="1" height="1" fill={fill} />);
    }
  });
  return (
    <svg width={size} viewBox="0 0 16 14" shapeRendering="crispEdges" role="img" aria-label="JoadT">
      {rects}
    </svg>
  );
}
