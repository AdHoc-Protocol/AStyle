type Handler<
  TEvent extends Event,
  TResult = void,
> = (event: TEvent) => TResult;

function create<
  T extends object,
  K extends keyof T,
>(obj: T, key: K): T[K] {
  if (a < b) {
    return obj[key];
  }
  const m = new Map<
    string,
    number
  >();
  return obj[key];
}
