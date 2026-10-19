def fact(n):
    return 1 if n <= 1 else n * fact(n - 1)

def fib(n):
    a, b = 0, 1
    for _ in range(n):
        a, b = b, a + b
    return a

def greet(name, greeting='Hello', *rest, **opts):
    return greeting + ', ' + name + str(len(rest)) + str(sorted(opts))

def counter():
    count = 0
    def inc(step=1):
        nonlocal_value = count + step
        return nonlocal_value
    return inc

print(fact(10), fib(20), greet('Ann'), greet('Bob', 'Hi', 1, 2, x=1, y=2))
sq = lambda x, y=2: x ** y
print(sq(5), sq(2, 10), (lambda: 42)())
total = 0
def add(n):
    global total
    total += n
add(3); add(4)
print(total, counter()(5))
print(list(map(lambda x: x * 2, [1, 2, 3])), list(filter(lambda x: x > 1, [1, 2, 3])), sorted(['bb', 'a', 'ccc'], key=len))
