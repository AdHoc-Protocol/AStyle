package com.example.shop;

import java.util.List;
import java.util.stream.Collectors;

public class Inventory {
private final List<Item> items;
public Inventory(List<Item> items){this.items=items;}

public record Item(String name, int count, double price) {
public Item {
if(count<0) throw new IllegalArgumentException("count");
}
}

public double total(){
double sum=0;
for(Item item:items){
if(item.count()==0) continue;
else if(item.price()>100)
{
sum+=item.price()*item.count()*0.9;
}
else sum+=item.price()*item.count();
}
return sum;
}

public String describe(Object o) {
return switch(o){
case Integer i when i>10 -> "big";
case Integer i -> "int "+i;
case String s -> {
String t=s.trim();
yield t;
}
default -> "other";
};
}

public List<String> names(){
return items.stream()
.filter(i->i.count()>0)
.map(Item::name)
.collect(Collectors.toList());
}

void report(){
switch(items.size()){
case 0: System.out.println("empty"); break;
default: System.out.println(total());
}
String text="""
    Items: %d
    """.formatted(items.size());
}
}
