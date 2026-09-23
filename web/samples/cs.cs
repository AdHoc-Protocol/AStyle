using System;
using System.Collections.Generic;
using System.Linq;

namespace Shop.Orders
{
public record Order(int Id, string Customer, decimal Total);

public class OrderService {
private readonly List<Order> orders=new();
public int Count { get; private set; }
public string Name
{
get { return name; }
set { name=value??"none"; }
}
private string name;

public decimal Discount(Order order) => order switch
{
{ Total: > 1000 } => order.Total*0.1m,
{ Customer: "vip" } => 50,
_ => 0
};

public IEnumerable<Order> Large(decimal min)
{
return orders.Where(o=>o.Total>min)
.OrderByDescending(o=>o.Total)
.ToList();
}

public void Add(Order order){
if(order==null) throw new ArgumentNullException(nameof(order));
else if(order.Total<0)
{
return;
}
switch(order.Customer){
case "vip":
Count+=2;
break;
default:
Count++;
break;
}
orders.Add(order with { Total=Math.Round(order.Total,2) });
var json = $"""
    {"id": {order.Id}}
    """;
}
}
}
