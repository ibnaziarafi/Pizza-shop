const pizzaSizes = (large, extraLarge) => [{name:'14″ Large',price:large},{name:'16″ XL',price:extraLarge}];

export const toppings = ['Pepperoni', 'Ham', 'Chorizo', 'Ground beef', 'Italian sausage', 'Mushrooms', 'Red onions', 'Bell peppers', 'Black olives', 'Spinach', 'Jalapeños', 'Pineapple'];

export const menu = [
  {id:'mexican',name:'Mexican Pizza',category:'Specialty Pizzas',description:'Smoky chorizo, beef, jalapeños, onions and bell peppers over mozzarella.',image:'./images/mexican.jpg',options:pizzaSizes(1699,2199),tag:'A little heat'},
  {id:'meat-lover',name:'Meat Lover',category:'Specialty Pizzas',description:'Pepperoni, ham, beef, sausage and smoky chorizo with mozzarella.',image:'./images/meat.jpg',options:pizzaSizes(1699,2199)},
  {id:'margherita',name:'Margherita',category:'Specialty Pizzas',description:'Fresh tomato, basil, garlic and olive oil with melted mozzarella.',image:'./images/margherita.jpg',options:pizzaSizes(1699,2199)},
  {id:'supreme',name:'Supreme',category:'Specialty Pizzas',description:'Pepperoni, ham, beef, sausage, onions, olives, mushrooms and bell peppers.',options:pizzaSizes(1799,2399)},
  {id:'vegetarian',name:'Vegetarian',category:'Specialty Pizzas',description:'Spinach, onions, black olives, mushrooms and bell peppers with mozzarella.',options:pizzaSizes(1699,2199)},
  {id:'hawaiiana',name:'Hawaiiana',category:'Specialty Pizzas',description:'Sweet pineapple, ham and mozzarella.',options:pizzaSizes(1699,2199)},
  {id:'chicken-bbq',name:'Chicken BBQ',category:'Specialty Pizzas',description:'Barbecue chicken, onions and honey barbecue sauce with mozzarella.',options:pizzaSizes(1699,2199)},
  {id:'white',name:'White Pizza',category:'Specialty Pizzas',description:'Garlic, basil, Parmesan and mozzarella over white sauce.',options:pizzaSizes(1699,2199)},
  {id:'mi-steak',name:'Mi Steak',category:'Specialty Pizzas',description:'Philly steak, bell peppers, onions and mushrooms with mozzarella.',options:pizzaSizes(1699,2199)},
  {id:'personal',name:'Build a Personal Pizza',category:'Build Your Own',description:'Start with a 10-inch cheese pizza and add up to four of your favorite toppings.',image:'./images/cheese.jpg',options:[{name:'10″ Personal',price:699}]},
  {id:'half',name:'Specialty Half & Half',category:'Build Your Own',description:'Choose two specialty flavors on one pizza.',image:'./images/half.jpg',options:pizzaSizes(1799,2399),tag:'Two flavors'},
  {id:'wings',name:'Original Smoky Wings',category:'Wings & Sides',description:'Smoky chicken wings for the whole table.',image:'./images/wings.jpg',options:[{name:'16 pieces',price:1899}]},
  {id:'plantains',name:'Green Plantains',category:'Wings & Sides',description:'Golden green plantains, perfect for sharing.',options:[{name:'Small',price:389},{name:'Large',price:599}]},
  {id:'calzone',name:'Deluxe Calzone',category:'Wings & Sides',description:'Mozzarella and ricotta with pepperoni, ham, sausage, bacon, peppers, onions and mushrooms.',options:[{name:'Regular',price:1399}]},
];
