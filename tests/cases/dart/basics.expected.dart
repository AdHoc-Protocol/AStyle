import 'package:flutter/material.dart';

class Counter extends StatefulWidget {
  const Counter({super.key, required this.title});
  final String title;
  @override
  State<Counter> createState() => _CounterState();
}

class _CounterState extends State<Counter> {
  int _count = 0;
  void _inc() {
    setState(() {
      _count++;
    });
  }
  @override
  Widget build(BuildContext context) {
    return Scaffold(
      appBar: AppBar(title: Text(widget.title)),
      body: Center(
        child: Column(
          children: [
            Text('Count: $_count'),
            ElevatedButton(onPressed: _inc, child: const Text('+')),
          ],
        ),
      ),
    );
  }
  Future<void> load() async {
    final data = await fetch();
    final names = data.where((e) => e.active).map((e) => e.name).toList();
    final m = {'a': 1, 'b': 2};
    final s = '''
multi ${names.length}
''';
    names..add('x')..add('y');
  }
}
