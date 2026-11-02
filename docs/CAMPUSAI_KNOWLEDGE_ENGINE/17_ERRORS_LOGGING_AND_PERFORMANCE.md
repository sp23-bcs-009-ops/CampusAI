# Errors and performance

Firestore/pack failures surface as unavailable messages. Empty/long questions are HTTP 400.

This pass did not rerun a live 21-call latency sweep. Earlier engine work measured Docker pytest on the order of ~8–11s for the full backend suite. Cold `/ask` to Firestore remains network-bound; social replies are in-process.
