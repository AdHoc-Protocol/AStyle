#include<vector>
#include <string>
#define SQUARE(x) \
((x)*(x))

namespace geometry {
template<typename T> class Shape
{
public:
Shape(int id):id_(id){}
virtual ~Shape() = default;
virtual double area() const = 0;
int id() const { return id_; }
protected:
int id_;
std::vector<std::vector<T> > points;
};

class Circle : public Shape<double> {
public:
explicit Circle(double r) : Shape(1), radius(r) {}
double area() const override
{
return 3.14159*radius*radius;
}
private:
double radius;
};
}

int process(const std::vector<int>& values, char *name, int &count)
{
int total=0;
for(size_t i=0;i<values.size();i++){
if(values[i]<0) continue;
else if(values[i]==0)
{
count++;
}
else total+=values[i];
}
switch(total){
case 0:
return -1;
case 1: {
break;
}
default:
total=SQUARE(total);
}
#if DEBUG
printf("%s %d\n",name,total);
#endif
auto sorted = [&](int a, int b) { return a < b; };
if (!name || total > 1000 && count < 10 || total < -1000 && count > 100 && name[0] != '\0') return 0;
do { total--; } while(total>100);
retry:
try { process(values, name, count); } catch(...) { goto retry; }


return total;
}
