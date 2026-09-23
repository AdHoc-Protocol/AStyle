class A {
void f() {
switch (x) {
case 1 -> b();
default -> c();
}
switch (x) {
case 1 -> {
b();
}
default -> c();
}
switch (x) {
case 1: {
b();
}
default:
c();
}
}
}
