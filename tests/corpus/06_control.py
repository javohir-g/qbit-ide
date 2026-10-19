out = []
i = 0
while i < 10:
    i += 1
    if i % 2 == 0:
        continue
    if i > 7:
        break
    out.append(i)
else:
    out.append('done')
print(out)
for i in range(3):
    for j in range(3):
        if j == 2:
            break
        print(i, j)
else:
    print('no break')
for n in range(2, 20):
    for d in range(2, n):
        if n % d == 0:
            break
    else:
        print(n, end=' ')
print()
x = 15
if x < 10:
    print('small')
elif x < 20:
    print('medium')
else:
    print('big')
print('yes' if x > 10 else 'no', x > 5 and x < 20, x < 5 or x == 15)
