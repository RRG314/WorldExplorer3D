# Proof: Hahn Valuation Axioms

Claim: For Q((t)) with v(sum a_n t^n)=min{n:a_n!=0}, we have:
1. v(0)=+infinity and v(x)=+infinity iff x=0.
2. v(xy)=v(x)+v(y).
3. v(x+y)>=min(v(x),v(y)).

Proof:
Let x=∑_i a_i t^i and y=∑_j b_j t^j with i0=v(x), j0=v(y).
For multiplication, the lowest exponent with nonzero coefficient in xy is i0+j0, so v(xy)=i0+j0=v(x)+v(y).
For addition, every term of x+y has exponent >= min(i0,j0); cancellation may increase valuation but cannot lower it.
Hence v(x+y)>=min(v(x),v(y)).
The zero-series statement is immediate from the definition.
