from fractions import Fraction as F
from collections import Counter
from pathlib import Path
import re

caps=Counter((a+b+6)*5 for a in range(1,7) for b in range(1,7))
assert min(caps)==40 and max(caps)==90 and sum(k*v for k,v in caps.items())==65*36
for capacity in caps:
    for pct in (10,30,50,70,90):
        initial=(capacity*pct+50)//100
        assert initial*100//capacity//20==pct//20
print('Confirmed general capacity: 36 outcomes, mean65; 55 midpoint/stage cases pass')
assert Counter(a+b-1 for a in range(1,4) for b in range(1,4))==Counter({1:1,2:2,3:3,4:2,5:1})
for t in range(10,76):
    bands=[set(range(1,6)),set(range(6,t+1)),set(range(t+1,t+21)),set(range(t+21,96)),set(range(96,101))]
    assert set.union(*bands)==set(range(1,101)) and sum(map(len,bands))==100
    if t==55: assert list(map(len,bands))==[5,50,20,20,5]
print('PROPOSAL A: 9 character outcomes; 66 thresholds x100 mutually-exclusive dice cases pass')
a=[F(20),F(20),F(15),F(20)]
b=a.copy()
for values,rates in [(a,[F(12,5),F(6),F(4),F(16,5)]),(b,[F(18,5),F(36,5),F(10),F(24,5)])]:
    for i in range(4): values[i]+=4*rates[i]
assert a==list(map(F,['29.6','44','31','32.8']))
assert b==list(map(F,['34.4','48.8','55','39.2']))
a[0]=max(F(0),a[0]-30); a[1]-=25
b[0]=max(F(0),b[0]-30); b[1]-=25
for values,hours,rates in [(a,F(4,3),[F(12,5),F(6),F(-5),F(-10)]),(b,F(2),[F(18,5),F(36,5),F(-5),F(-10)])]:
    for i in range(4): values[i]+=hours*rates[i]
assert a==[F('3.2'),F(27),F(73,3),F(292,15)]
assert b==list(map(F,['11.6','38.2','45','19.2']))
assert F('32.8')-15*F(10,12)>20 and F('32.8')-16*F(10,12)<=20
assert F('39.2')-23*F(10,12)>20 and F('39.2')-24*F(10,12)<=20
for i,rate in enumerate([F(12,5),F(6),F(1),F(16,5)]): a[i]+=F(2,3)*rate
assert a==list(map(F,['4.8','31','25','21.6']))
print('PROPOSAL C: exact-rational A/B work, ingestion, sleep80/120, awake40 cases pass')
assert min(65,64+3-1)-4-5==56
assert min(65,64+3-4)==63 and min(65,64+3)-4==61
assert sum(start>=482 and start+5<=492 for start in range(480,495,5))==1
assert sum(start>=482 and start+5<=537 for start in range(480,540,5))==10
print('PROPOSAL D: group-order/clipping and off-grid full-coverage examples pass')
root=Path(__file__).resolve().parents[3]
files=['docs/design/character-dice-energy-recommendation-2026-11-09.md','docs/verification/character-dice-energy-handoff-2026-11-09.md','docs/verification/mental-energy-integration-255.md']
count=0
for file in files:
    p=root/file
    for link in re.findall(r'\]\(([^)]+)\)',p.read_text()):
        if '://' in link or link.startswith('#'): continue
        assert (p.parent/link.split('#')[0]).exists(),(file,link)
        count+=1
print(f'Document references: {count} relative targets exist')
print('Arithmetic/document checks only; no product runtime, model transport or policy activation')
