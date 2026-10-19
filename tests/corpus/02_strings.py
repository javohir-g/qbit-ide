s = 'Привет, q.bit!'
print(len(s), s.upper(), s.lower(), s[0], s[-1], s[1:4], s[::-1])
print('a,b,c'.split(','), '-'.join(['x', 'y', 'z']), '  pad  '.strip() + '|', 'abc'.replace('b', 'B'))
print('abc' < 'abd', 'a' in 'cat', 'z' not in 'cat', 'ab' * 3, 'x' + 'y')
print('{} and {}'.format('one', 2), '{0}{0}{1}'.format('a', 'b'), '%d items, %s, %.2f' % (3, 'ok', 2.5))
n = 7
print(f'n={n} double={n * 2} pad={n:03d} fixed={3.14159:.2f} text={"hi":>5}|')
print('hello world'.title(), 'abc'.startswith('ab'), 'abc'.endswith('bc'), 'a b  c'.split(), 'abcabc'.find('c'), 'abcabc'.count('b'))
print(str(12) + str(3.5) + str(True) + str(None), repr('q'), ord('a'), chr(100))
