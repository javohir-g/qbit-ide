d = {'a': 1, 'b': 2}
d['c'] = 3
d['a'] += 10
print(d, d['a'], d.get('z'), d.get('z', 0), 'b' in d, len(d))
print(list(d.keys()), list(d.values()), list(d.items()))
for k in d:
    print(k, d[k])
e = {1: 'one', 2: 'two', (1, 2): 'pair'}
print(e[1], e[(1, 2)], e.pop(2), e)
