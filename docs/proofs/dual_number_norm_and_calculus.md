# Proof: Dual Number Ring and Norm

Model: K is a non-Archimedean valued field with absolute value |.|. Define K[epsilon]/(epsilon^2).
Element form: z = x + epsilon y.

Multiplication:
(x + epsilon y)(u + epsilon v) = xu + epsilon(xv + uy), since epsilon^2=0.

Norm definition:
||x + epsilon y|| = max(|x|, |y|).

Ultrametric addition:
||z1+z2|| = max(|x1+x2|, |y1+y2|) <= max(max(|x1|,|x2|), max(|y1|,|y2|)) = max(||z1||,||z2||).

Submultiplicativity:
||z1 z2|| = max(|x1x2|, |x1y2 + x2y1|) <= max(|x1||x2|, max(|x1||y2|, |x2||y1|)) <= ||z1|| ||z2||.

Dual evaluation (polynomial f):
By binomial theorem in a commutative ring with epsilon^2=0, (x+epsilon y)^n = x^n + n x^{n-1} epsilon y.
Hence f(x+epsilon y) = f(x) + epsilon f'(x) y.
