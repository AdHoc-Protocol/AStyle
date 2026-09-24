struct Point {
    int x = 0; // horizontal
    int y = 0; // vertical
    const char *label = "p";
    unsigned long long id;
    static constexpr double scale = 1.5;
};

void init(Point &p) {
    p.x = 640;
    p.y = 480;
    p.id += 2;
    auto raw = R"(a = b // c)";
}
