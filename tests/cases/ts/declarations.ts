export interface User {
id: number;
name?: string;
readonly tags: string[];
delete(): void;
}
export enum Color { Red, Green = 'g', Blue }
namespace NS {
export const x = 1;
}
declare module 'foo' {
export function bar(a: string): number;
}
@Component({
selector: 'app-root',
template: '<div></div>',
})
export class AppComponent<T extends object> implements OnInit {
@Input() name: string;
private readonly items: Map<string, Array<number>> = new Map();
constructor(private http: HttpClient) {}
async ngOnInit(): Promise<void> {
const x = this.http.get<User[]>('/api') as Observable<User[]>;
for await (const chunk of stream) {
console.log(chunk!);
}
}
get value(): string { return this.name ?? ''; }
static create<U>(): AppComponent<U> {
return new AppComponent<U>();
}
}
function isString(x: unknown): x is string {
return typeof x === 'string';
}
type Fn = (a: number, b?: string) => void;
type Obj = {
a: string;
b: number;
};
const fn = <T,>(x: T): T => x;
