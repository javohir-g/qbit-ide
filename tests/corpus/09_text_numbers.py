def to_text(v):
    return str(v)
print(to_text(5) + to_text(2.5) + to_text(-1), len(to_text(12345)), int('0042'), str(10 // 3) + '|' + str(10 % 3))
vals = [3, 1, 2]
total = 0
for v in vals:
    total += v
print(total, total / len(vals) == 2, total // len(vals))
print(100000 * 100000, 2 ** 40, 7 // 2 * 2 + 7 % 2)
print(str(1.5), str(0.5), str(100.25), str(-0.001), str(1.0 * 3 == 3))
print(max('apple', 'pear'), min([3, 1.5]), sum([0.5, 0.25]), abs(-0.5))
