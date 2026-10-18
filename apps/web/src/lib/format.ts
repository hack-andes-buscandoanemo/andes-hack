// One decimal and a comma, as people read it in Peru.
export const kg = (value: number) => `${value.toFixed(1).replace(".", ",")} kg`;
