// Isolated benchmark, not application runtime. Caller owns all allocated buffers.
// ABI accepts f64 arrays with finite, nondecreasing distances and numeric heights.
#[no_mangle]
pub extern "C" fn allocate(len: usize) -> *mut f64 {
    Box::into_raw(vec![0.0; len].into_boxed_slice()) as *mut f64
}

#[no_mangle]
pub unsafe extern "C" fn release(ptr: *mut f64, len: usize) {
    drop(Box::from_raw(std::ptr::slice_from_raw_parts_mut(ptr, len)));
}

fn finite(value: f64) -> f64 { if value.is_finite() { value } else { f64::NAN } }

#[no_mangle]
pub unsafe extern "C" fn sample(dp: *const f64, vp: *const f64, len: usize, distance: f64) -> f64 {
    if len == 0 { return f64::NAN; }
    let d = std::slice::from_raw_parts(dp, len);
    let v = std::slice::from_raw_parts(vp, len);
    if distance <= 0.0 { return finite(v[0]); }
    let last = len - 1;
    if distance >= d[last] { return finite(v[last]); }
    if len == 1 { return finite(v[last]); }
    let (mut lo, mut hi) = (1, last);
    while lo < hi {
        let mid = (lo + hi) / 2;
        if d[mid] < distance { lo = mid + 1; } else { hi = mid; }
    }
    let i = lo - 1;
    if distance < d[i] || distance > d[i + 1] { return finite(v[last]); }
    let span = d[i + 1] - d[i];
    let t = if span > 1e-6 { (distance - d[i]) / span } else { 0.0 };
    let from = if v[i].is_finite() { v[i] } else { 0.0 };
    let to = if v[i + 1].is_finite() { v[i + 1] } else { from };
    from + (to - from) * t
}

#[no_mangle]
pub unsafe extern "C" fn batch(data: *const f64, queries: *const f64, out: *mut f64, count: usize) {
    // Four f64 fields per query: distance offset, height offset, length, query distance.
    for i in 0..count {
        let q = queries.add(i * 4);
        *out.add(i) = sample(data.add(*q as usize), data.add(*q.add(1) as usize), *q.add(2) as usize, *q.add(3));
    }
}

#[cfg(test)]
mod tests {
    use super::*;
    fn lookup(d: &[f64], v: &[f64], q: f64) -> f64 {
        assert_eq!(d.len(), v.len());
        unsafe { sample(d.as_ptr(), v.as_ptr(), d.len(), q) }
    }
    #[test]
    fn clamps_and_interpolates() {
        let d = [0.0, 10.0, 20.0]; let v = [2.0, 6.0, 8.0];
        assert_eq!(lookup(&d, &v, -1.0), 2.0);
        assert_eq!(lookup(&d, &v, 5.0), 4.0);
        assert_eq!(lookup(&d, &v, 10.0), 6.0);
        assert_eq!(lookup(&d, &v, 30.0), 8.0);
    }
    #[test]
    fn duplicate_knots_and_nonfinite_heights() {
        assert_eq!(lookup(&[0.0, 10.0, 10.0, 20.0], &[0.0, 1.0, 9.0, 10.0], 10.0), 1.0);
        assert_eq!(lookup(&[0.0, 10.0], &[f64::NAN, 4.0], 5.0), 2.0);
        assert_eq!(lookup(&[0.0, 10.0], &[2.0, f64::INFINITY], 5.0), 2.0);
        assert!(lookup(&[0.0, 10.0], &[2.0, f64::NAN], 20.0).is_nan());
        assert!(lookup(&[], &[], 0.0).is_nan());
    }
    #[test]
    fn batch_uses_offsets_and_releases_owned_allocations() {
        unsafe {
            let data = allocate(4); let query = allocate(4); let out = allocate(1);
            std::ptr::copy_nonoverlapping([0.0, 10.0, 2.0, 6.0].as_ptr(), data, 4);
            std::ptr::copy_nonoverlapping([0.0, 2.0, 2.0, 5.0].as_ptr(), query, 4);
            batch(data, query, out, 1); assert_eq!(*out, 4.0);
            release(data, 4); release(query, 4); release(out, 1);
        }
    }
}
