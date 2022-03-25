// Makes token amounts human readable (by adding decimals) while keeps precision
// For instance: if we have 990099.000364464662179907 denoms on the chain =>
// The human readable form will be 990,099.000364464662179907
export const separateDecimals = (amount) => {
    return cutTrailingZeroes(amount.replace(/\d{1,3}(?=(\d{3})+(?=\.))/gm, "$&,"));
}

// Makes token amounts human readable while keeps precision
// It works on whole numbers by adding a point 
// For instance: if we have 990099000364464662179907 denoms on the chain =>
// The human readable form will be 990099.000364464662179907
export const separateFractions = (amount) => {
    if (amount.length < 19) {
        const zero = "0";
        const zeroTimes = 19 - amount.length;
        amount = zero.repeat(zeroTimes) + amount;
    }
    return amount.replace(/(?=(.{18}){1}$)/gm, ".");
}

// 990,099.000364464660009000 => 990,099.000364464660009
export const cutTrailingZeroes = (amount) => {
    return amount.replace(/(?<=[\.|\,]\d+?)0+(?=$)/gm, "");
}