l = [5, 3, 8, 1]
l.append(9)
l.insert(0, 7)
print(l, len(l), l[0], l[-1], l[1:3], l[::2], 8 in l, l.index(8), l.count(5))
l.sort()
print(l, sorted(l, reverse=True), list(reversed(l)))
l.remove(8)
print(l.pop(), l.pop(0), l)
m = [0] * 3
m[1] = 5
print(m, m + [1, 2], [1, 2] * 2)
a, b = (1, 2)
print(a, b)
print([x * x for x in range(6) if x % 2 == 0], [(i, i + 1) for i in range(3)])
print(list(range(10, 0, -3)), list(zip([1, 2, 3], 'abc')), list(enumerate(['x', 'y'], 1)), any([0, 0, 1]), all([1, 1, 0]))
t = (1, 2, 3)
x, y, z = t
print(t, x + y + z, t[1], len(t), (1,), ())
