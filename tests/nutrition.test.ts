import {describe,expect,it} from 'vitest';
import {energyEstimate,portionSchema,portionValues,sumPortions,type Food} from '../lib/nutrition';
import {dutchMarketFirst,foodSearchUrl,fromOpenFoodFacts} from '../lib/open-food-facts';

const oats:Food={name:'Raw oats',source:'Custom label',preparation:'Raw',basis:'g',values:{kcal:380,protein:12,fiber:10},serving:{amount:40,unit:'g'}};
const plain:Food={name:'Plain drink',source:'Custom label',preparation:'As sold',basis:'serving',values:{kcal:80,sodium:0},serving:{amount:250,unit:'ml'}};

describe('nutrition portions and recipes',()=>{
  it('scales grams, label servings and millilitres using the declared basis',()=>{
    expect(portionValues({food:oats,amount:25,unit:'g'})).toMatchObject({kcal:95,protein:3,fiber:2.5,fat:null});
    expect(portionValues({food:oats,amount:2,unit:'serving'}).kcal).toBe(304);
    expect(portionValues({food:plain,amount:125,unit:'ml'})).toMatchObject({kcal:40,sodium:0});
    expect(portionSchema.safeParse({food:plain,amount:125,unit:'g'}).success).toBe(false);
    expect(portionSchema.safeParse({food:oats,amount:125,unit:'ml'}).success).toBe(false);
  });
  it('keeps unknown nutrients unknown and divides a recipe by its yield',()=>{
    expect(sumPortions([{food:oats,amount:100,unit:'g'},{food:plain,amount:250,unit:'ml'}],2)).toMatchObject({
      kcal:230,protein:null,fiber:null,sodium:null,
    });
    expect(sumPortions([]).kcal).toBe(0);
  });
  it('applies the published equation and one overall activity multiplier',()=>{
    expect(energyEstimate(30,180,80,5,1.55)).toEqual({resting:1780,maintenance:2759});
    expect(energyEstimate(30,180,80,-161,1.2).resting).toBe(1614);
  });
});

describe('Open Food Facts',()=>{
  it('converts label kJ and mg and ignores estimates, prepared data and trace thresholds',()=>{
    const label={per:'100ml',per_unit:'ml',preparation:'as_sold',source:'packaging',nutrients:{
      'energy-kj':{unit:'kJ',value:418.4},sodium:{unit:'mg',value:60},fat:{unit:'g',value:0},
      sugars:{unit:'g',value:0.5,modifier:'<'},proteins:{unit:'g',value_computed:12},
    }};
    const food=fromOpenFoodFacts({code:'0123456789123',product_name:'Drink',product_name_nl:'Drank',serving_size:'1 glass (250 ml)',
      nutrition:{input_sets:[{...label,source:'estimate'},{...label,preparation:'prepared'},label]}});
    expect(food).toMatchObject({name:'Drank',basis:'ml',serving:{unit:'ml',amount:250},values:{sodium:.06,fat:0,protein:null,sugar:null}});
    expect(food?.values.kcal).toBeCloseTo(100);
    expect(portionSchema.safeParse({food,amount:100,unit:'g'}).success).toBe(false);
  });
  it('does not infer the nutrition basis from package volume, and keeps unretrieved values empty',()=>{
    const food=fromOpenFoodFacts({code:'0123456789123',product_name:'Drink',product_quantity_unit:'ml'});
    expect(food?.values.kcal).toBeNull();
    expect(foodSearchUrl('name','appel & peer').searchParams.get('q')).toBe('appel & peer');
    expect(foodSearchUrl('brand','Albert Heijn').searchParams.get('brands_tags')).toBe('albert-heijn');
    expect(foodSearchUrl('barcode','012345').pathname).toContain('012345.json');
    const local={countries:['en:netherlands']};
    expect(dutchMarketFirst([{},local])[0]).toBe(local);
  });
});
