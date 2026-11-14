# Mi Pizza Norcross

Mi Pizza's new storefront and staff dashboard. Customers can browse, search and customize pizzas, submit a test pickup and track it from kitchen to counter. Staff can update orders, pause pickup, change the estimated wait and mark food sold out.

## Run locally

Use Node.js 24 or later. There are no package dependencies.

```sh
node local.mjs
```

Open http://127.0.0.1:4173/ for the storefront and http://127.0.0.1:4173/staff for the kitchen. The demo PIN is `2468`. Orders and settings persist in `data/local.sqlite`. Use sample contact details.

Run the API checks with `node --test test-backend.mjs`. Use `node build.mjs` to package the Worker, D1 migration and storefront assets. Hosted staff access uses `STAFF_PIN` and `SESSION_SECRET` as environment secrets. The hosted database is separate from the local preview. For Sites deployment, set `project_id` in `.openai/hosting.json` to your own Sites project ID before building.

## Preview scope

Pickup is simulated. The demo catalog contains 14 items and illustrative food photography. Prices, taxes, modifiers, operational hours and customer data policies need business approval before live ordering. The existing KwickMenu remains the order destination. The preview has no card processing, delivery dispatch or POS sync.

## References

- [Mi Pizza current site](https://mipizzanorcross.kwickmenu.com)
- [Mi Pizza menu mirror](https://www.vmbook.com/r/mipizzanorcross)
- [Mi Pizza delivery menu](https://www.ubereats.com/store/mi-pizza/F_tG6ZE2XgOM3t5ej6xDcg)
- [Domino’s app](https://www.dominos.com.au/app), [Pizzarazzi](https://pizzarazzi.com.au/#home), [Pizza Hut menu](https://www.pizzahut.com.au/menu/pizza/)
