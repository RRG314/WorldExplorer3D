# Proof: Depth-Indexed Square-Zero Tower

Consistent construction:
H = K (+) M, where M = direct-sum_{d>=0} K*epsilon_d, with epsilon_i*epsilon_j=0 for all i,j.
Elements: x + sum_d epsilon_d y_d with finite support.

Ring law:
(x+m)(u+n) = xu + (xn + um), because mn=0.
This gives a commutative ring with identity (1+0).

Nilpotents:
epsilon_d^2 = 0 and epsilon_i epsilon_j = 0 (i!=j) by definition.

Norm:
||x + sum epsilon_d y_d|| = max(|x|, max_d |y_d|).
Using ultrametricity on K and finite maxima,
||a+b|| <= max(||a||,||b||) and ||ab|| <= ||a|| ||b||.

Not a field:
Any nonzero epsilon_d is nilpotent, hence not invertible. Therefore H is a ring, not a field.
