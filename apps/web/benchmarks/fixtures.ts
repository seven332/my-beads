export const scenarios = [50, 100, 256].flatMap((size) =>
  (["blank", "sparse", "full"] as const).map((fill) => ({
    id: `${size}-${fill}`,
    width: size,
    height: size,
    fill,
  })),
);
scenarios.push({ id: "17x100-sparse", width: 17, height: 100, fill: "sparse" });

export function fixture(scenario: (typeof scenarios)[number]) {
  const colors = ["H7", "H2", "H4", "B15", "D22", "G14"];
  return (
    Array.from({ length: scenario.height }, (_, y) =>
      Array.from({ length: scenario.width }, (_, x) =>
        scenario.fill === "blank" || (scenario.fill === "sparse" && (x + y * 3) % 7 !== 0)
          ? ""
          : colors[(x + y) % colors.length],
      ).join(","),
    ).join("\n") + "\n"
  );
}
