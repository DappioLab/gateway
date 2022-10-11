# Dappio Gateway: The Framework that Empowers the Composability of Solana Programs

## What is Gateway?

- It's an universal interface for various Solana DeFi Protocols
  - Pool
  - Farm
  - Leveraged Farm
  - MoneyMarket
  - Vault
  - ...
- It's a CaaS (Compasaility-as-a-Service) that standardizes inter-protocol interaction on Solana to unlock the potential of composability
- It's a common knowledge base that helps Solana community learn and improve

## Architecture

![](https://hackmd.io/_uploads/Skbcueoyi.jpg)

- **Builder**: Off-chain component that helps composing different DeFi actions
- **Protocol(s)**: Off-chain component that packages the specific instruction set of each protocol
- **Gateway**: On-chain program that manages state and distributes fees
- **Adapter(s)**: On-chain program that connects base program and Gateway program

## Workflow

![](https://hackmd.io/_uploads/Bkvs9tU1i.png)

## Supported Protocols

See [adapter-programs](https://github.com/DappioWonderland/adapter-programs#supported-protocols) for more details

## Documentation

- [Typedoc](http://68.183.184.205:3001/modules.html)

## References

- https://guide.dappio.xyz/the-universal-rabbit-hole
