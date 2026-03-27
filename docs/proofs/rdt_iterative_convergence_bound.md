# Proof: Iterative RDT Convergence Bound

Definition (iterative form): x_{i+1}=floor(x_i/d_i), d_i=max(2,floor((log x_i)^alpha)), x_0=n>=2.

Claim: The process terminates and depth k satisfies k<=ceil(log_2 n).

Proof:
Since d_i>=2, we have x_{i+1}=floor(x_i/d_i)<=x_i/2.
Inductively, x_i<=n/2^i.
If i>log_2 n then n/2^i<1, so x_i<1 and integer x_i must be <=1.
Therefore termination occurs by i=ceil(log_2 n).
