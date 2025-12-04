pragma circom 2.0.0;

include "../node_modules/circomlib/circuits/poseidon.circom";

template Auth() {
    // Private input
    signal input secret;

    // Public input
    signal output publicHash;

    // Hash the secret using Poseidon
    component poseidon = Poseidon(1);
    poseidon.inputs[0] <== secret;

    // Constrain the output of the hash to be equal to the public hash
    publicHash <== poseidon.out;
}

component main = Auth();
