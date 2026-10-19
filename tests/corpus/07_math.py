import math
import random
print(math.sqrt(17) > 4.1, math.floor(2.7), math.ceil(2.1), math.pi > 3.14, math.fabs(-2.5), math.pow(2, 8) == 256, round(math.sin(math.pi / 2), 3) == 1, round(math.atan2(1, 1), 4))
print(round(math.log(math.e), 3) == 1, round(math.log10(1000), 3) == 3, math.degrees(math.pi) == 180, round(math.radians(180), 4), math.trunc(-2.7), math.hypot(3, 4) == 5)
random.seed(5)
v = [random.randint(1, 6) for _ in range(100)]
print(min(v) >= 1, max(v) <= 6, len(v), 1 <= random.random() + 1 < 2, random.choice([7]), 0 <= random.randrange(5) < 5)
