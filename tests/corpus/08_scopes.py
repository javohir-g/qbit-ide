x = 'global'
def show():
    return x
def shadow():
    x = 'local'
    return x
def update():
    global x
    x = 'changed'
print(show(), shadow(), show())
update()
print(show())
def outer():
    v = 1
    def inner():
        return v + 1
    v = 10
    return inner()
print(outer())
def default_mutable(a, acc=None):
    acc = acc if acc is not None else []
    acc.append(a)
    return acc
print(default_mutable(1), default_mutable(2), default_mutable(3, [0]))
