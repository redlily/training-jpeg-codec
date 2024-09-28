export function checkEquals(expected, actual, message = undefined) {
    if (actual !== expected) {
        throw new Error(message != null ? message : `Not equal: expected=${expected}, actual=${actual}`);
    }
}

export function checkRange(min, max, actual, message = undefined) {
    if (actual < min || actual > max) {
        throw new Error(message != null ? message : `Out of range: min=${min}, max=${max}, value=${actual}`);
    }
}

export function checkContains(expected, actual, message = undefined) {
    if (!expected.find(element => element === actual)) {
        throw new Error(message != null ? message : `Not contains: expected=${expected.join(", ")}, actual=${actual}`);
    }
}

export function checkEqualsWithMaker(targets, expected, marker, actual, message = undefined) {
    for (let target of targets) {
        if (target === marker) {
            checkEquals(expected, actual, message);
        }
    }
}

export function checkRangeWithMarker(targets, min, max, marker, actual, message = undefined) {
    for (let target of targets) {
        if (target === marker) {
            checkRange(min, max, actual, message);
        }
    }
}

export function checkContainsWithMarker(targets, expected, marker, actual, message = undefined) {
    for (let target of targets) {
        if (target === marker) {
            checkContains(expected, actual, message);
        }
    }
}
