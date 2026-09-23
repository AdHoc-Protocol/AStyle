const f = Factory.define<X>(
  ({ sequence }) => ({
    alert: {
      id: String(sequence),
    } satisfies Def,
    for: '5m',
    annotations: {}, // comment
    fn: () => {
      return 1;
    },
    method() {
      return 2;
    },
  })
);
const g = cond ? { a: 1 } : { b: 2 };
const h = {
  x: cond ? {
    a: 1,
  } : null,
};
