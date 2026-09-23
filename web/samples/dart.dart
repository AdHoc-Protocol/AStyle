import 'package:flutter/material.dart';

class Counter extends StatefulWidget {
const Counter({super.key,required this.title});
final String title;
@override
State<Counter> createState()=>_CounterState();
}

class _CounterState extends State<Counter> {
int _count=0;
void _increment(){
setState((){
_count++;
});
}
@override
Widget build(BuildContext context){
return Scaffold(
appBar: AppBar(title: Text(widget.title)),
body: Center(
child: Column(
children: [
Text('Count: $_count'),
ElevatedButton(onPressed: _increment, child: const Text('+')),
],
),
),
);
}
Future<void> load() async {
final data=await fetch();
if(data.isEmpty){ return; }
else if (data.length>100)
{
print('many');
}
final names=data.where((e)=>e.active).map((e)=>e.name).toList();
}
}
