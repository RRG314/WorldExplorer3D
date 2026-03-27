# No-Go: Raw RDT Depth as Integer Valuation

Proposition 1 (bounded-depth obstruction):
If v:N->R satisfies v(ab)=v(a)+v(b), v(1)=0, and v is bounded above while v(2)>0, contradiction.
Proof: v(2^k)=k v(2) is unbounded as k->infinity.

For the DP recursive depth used in the Recursive-Adic draft, R(n) numerically saturates near 3 for alpha=1.5, while R(2)=1.
Hence raw R(n) cannot be a nontrivial multiplicative valuation on integers.

Proposition 2 (restriction to Q):
Nontrivial non-Archimedean valuations on Q are p-adic up to equivalence (Ostrowski).
Therefore any direct valuation on integers inherited from Q must align with c*nu_p, which raw RDT depths do not.
