odoo.define('altanmia_pos_with_template.product_template', function (require) {
    "use strict";

var models = require('point_of_sale.models');
const PosDB = require('point_of_sale.DB');
var utils = require('web.utils');
var exports = {};


exports.ProductTemplate = Backbone.Model.extend({
    initialize: function(attr, options){
        _.extend(this, options);
    },
    isAllowOnlyOneLot: function() {
        const productUnit = this.get_unit();
        return this.tracking === 'lot' || !productUnit || !productUnit.is_pos_groupable;
    },
    get_unit: function() {
        var unit_id = this.uom_id;
        if(!unit_id){
            return undefined;
        }
        unit_id = unit_id[0];
        if(!this.pos){
            return undefined;
        }
        return this.pos.units_by_id[unit_id];
    },

    get_price: function(pricelist, quantity, price_extra){
        var self = this;
        var date = moment();

        // In case of nested pricelists, it is necessary that all pricelists are made available in
        // the POS. Display a basic alert to the user in this case.
        if (pricelist === undefined) {
            alert(_t(
                'An error occurred when loading product prices. ' +
                'Make sure all pricelists are available in the POS.'
            ));
        }

        var category_ids = [];
        var category = this.categ;
        while (category) {
            category_ids.push(category.id);
            category = category.parent;
        }

        var pricelist_items = _.filter(pricelist.items, function (item) {
//            return (! item.product_tmpl_id || item.product_tmpl_id[0] === self.product_tmpl_id) &&
              return   (! item.product_id || item.product_id[0] === self.id) &&
                    (! item.categ_id || _.contains(category_ids, item.categ_id[0])) &&
                   (! item.date_start || moment(item.date_start).isSameOrBefore(date)) &&
                   (! item.date_end || moment(item.date_end).isSameOrAfter(date));
        });

        var price = self.list_price;
        if (price_extra){
            price += price_extra;
        }
        _.find(pricelist_items, function (rule) {
            if (rule.min_quantity && quantity < rule.min_quantity) {
                return false;
            }

            if (rule.base === 'pricelist') {
                price = self.get_price(rule.base_pricelist, quantity);
            } else if (rule.base === 'standard_price') {
                price = self.standard_price;
            }

            if (rule.compute_price === 'fixed') {
                price = rule.fixed_price;
                return true;
            } else if (rule.compute_price === 'percentage') {
                price = price - (price * (rule.percent_price / 100));
                return true;
            } else {
                var price_limit = price;
                price = price - (price * (rule.price_discount / 100));
                if (rule.price_round) {
                    price = round_pr(price, rule.price_round);
                }
                if (rule.price_surcharge) {
                    price += rule.price_surcharge;
                }
                if (rule.price_min_margin) {
                    price = Math.max(price, price_limit + rule.price_min_margin);
                }
                if (rule.price_max_margin) {
                    price = Math.min(price, price_limit + rule.price_max_margin);
                }
                return true;
            }

            return false;
        });

        // This return value has to be rounded with round_di before
        // being used further. Note that this cannot happen here,
        // because it would cause inconsistencies with the backend for
        // pricelist that have base == 'pricelist'.
        return price;
    },
});

models.load_models([
        {
        model:  'product.template',
        label: 'load_products',
        condition: function (self) { return !self.config.limited_products_loading; },
        fields: ['display_name', 'list_price', 'standard_price', 'categ_id', 'pos_categ_id', 'taxes_id',
                 'barcode', 'default_code', 'to_weight', 'uom_id', 'description_sale', 'description',
                 'tracking', 'write_date', 'available_in_pos', 'attribute_line_ids','product_variant_id','product_variant_ids', 'active'],
        order:  _.map(['sequence','default_code','name'], function (name) { return {name: name}; }),
        domain: function(self){
            var domain = ['&', '&', ['sale_ok','=',true],['available_in_pos','=',true],'|',['company_id','=',self.config.company_id[0]],['company_id','=',false]];
            if (self.config.limit_categories &&  self.config.iface_available_categ_ids.length) {
                domain.unshift('&');
                domain.push(['pos_categ_id', 'in', self.config.iface_available_categ_ids]);
            }
            if (self.config.iface_tipproduct){
              domain.unshift(['id', '=', self.config.tip_product_id[0]]);
              domain.unshift('|');
            }

            return domain;
        },
        context: function(self){ return { display_default_code: false }; },
        loaded: function(self, products){
            var using_company_currency = self.config.currency_id[0] === self.company.currency_id[0];
            var conversion_rate = self.currency.rate / self.company_currency.rate;
            self.db.add_products_temp(_.map(products, function (product) {
                if (!using_company_currency) {
                    product.list_price = round_pr(product.list_price * conversion_rate, self.currency.rounding);
                }
                product.categ = _.findWhere(self.product_categories, {'id': product.categ_id[0]});
                product.pos = self;
                return new exports.ProductTemplate({}, product);
            }));
        },
    }
]);

PosDB.include({
   init: function(options){
        _.extend(this, options);
        this.product_temp_by_id = {};
        this.product_temp_by_barcode = {};
        this.product_temp_by_category_id = {};
        this.product_temp_packaging_by_barcode = {};
        // Call parent method
        this.category_temp_by_id = {};
        this.root_category_temp_id  = 0;
        this.category_temp_products = {};
        this.category_temp_ancestors = {};
        this.category_temp_childs = {};
        this.category_temp_parent    = {};
        this.category_temp_search_string = {};

        this._super.apply(this, options);
    },

    get_product_temp_by_id: function(id){
        return this.product_temp_by_id[id];
    },

    get_product_by_category: function(category_id){
        var product_ids  = this.product_temp_by_category_id[category_id];
        var list = [];
        if (product_ids) {
            for (var i = 0, len = Math.min(product_ids.length, this.limit); i < len; i++) {
                const product = this.product_temp_by_id[product_ids[i]];
                if (!(product.active && product.available_in_pos)) continue;
                list.push(product);
            }
        }
        return list;
    },

    search_product_in_category: function(category_id, query){
        try {
            query = query.replace(/[\[\]\(\)\+\*\?\.\-\!\&\^\$\|\~\_\{\}\:\,\\\/]/g,'.');
            query = query.replace(/ /g,'.+');
            var re = RegExp("([0-9]+):.*?"+utils.unaccent(query),"gi");
        }catch(e){
            return [];
        }
        var results = [];
        for(var i = 0; i < this.limit; i++){
            var r = re.exec(this.category_temp_search_string[category_id]);
            if(r){
                var id = Number(r[1]);
                const product = this.get_product_temp_by_id(id);
                if (!(product.active && product.available_in_pos)) continue;
                results.push(product);
            }else{
                break;
            }
        }
        return results;
    },

    add_products_temp: function(products){
        var stored_categories = this.product_temp_by_category_id;

        if(!products instanceof Array){
            products = [products];
        }
        for(var i = 0, len = products.length; i < len; i++){
            var product = products[i];
            if (product.id in this.product_temp_by_id) continue;
            if (product.available_in_pos){
                var search_string = utils.unaccent(this._product_search_string(product));
                var categ_id = product.pos_categ_id ? product.pos_categ_id[0] : this.root_category_temp_id;
                //product.product_tmpl_id = product.product_tmpl_id[0];
                if(!stored_categories[categ_id]){
                    stored_categories[categ_id] = [];
                }
                stored_categories[categ_id].push(product.id);

                if(this.category_temp_search_string[categ_id] === undefined){
                    this.category_temp_search_string[categ_id] = '';
                }
                this.category_temp_search_string[categ_id] += search_string;

                var ancestors = this.category_temp_ancestors[categ_id] || [];

                for(var j = 0, jlen = ancestors.length; j < jlen; j++){
                    var ancestor = ancestors[j];
                    if(! stored_categories[ancestor]){
                        stored_categories[ancestor] = [];
                    }
                    stored_categories[ancestor].push(product.id);

                    if( this.category_temp_search_string[ancestor] === undefined){
                        this.category_temp_search_string[ancestor] = '';
                    }
                    this.category_temp_search_string[ancestor] += search_string;
                }
            }
            this.product_temp_by_id[product.id] = product;
            if(product.barcode){
                this.product_temp_by_barcode[product.barcode] = product;
            }
        }
    },

    get_category_by_id: function(categ_id){
        if(categ_id instanceof Array){
            var list = [];
            for(var i = 0, len = categ_id.length; i < len; i++){
                var cat = this.category_temp_by_id[categ_id[i]];
                if(cat){
                    list.push(cat);
                }else{
                    console.error("get_category_by_id: no category has id:",categ_id[i]);
                }
            }
            return list;
        }else{
            return this.category_temp_by_id[categ_id];
        }
    },

    add_categories: function(categories){
        var self = this;
        if(!this.category_temp_by_id[this.root_category_temp_id]){
            this.category_temp_by_id[this.root_category_temp_id] = {
                id : this.root_category_temp_id,
                name : 'Root',
            };
        }
        categories.forEach(function(cat){
            self.category_temp_by_id[cat.id] = cat;
        });
        categories.forEach(function(cat){
            var parent_id = cat.parent_id[0];
            if(!(parent_id && self.category_temp_by_id[parent_id])){
                parent_id = self.root_category_temp_id;
            }
            self.category_temp_parent[cat.id] = parent_id;
            if(!self.category_temp_childs[parent_id]){
                self.category_temp_childs[parent_id] = [];
            }
            self.category_temp_childs[parent_id].push(cat.id);
        });

        function make_ancestors(cat_id, ancestors){
            self.category_temp_ancestors[cat_id] = ancestors;

            ancestors = ancestors.slice(0);
            ancestors.push(cat_id);

            var childs = self.category_temp_childs[cat_id] || [];
            for(var i=0, len = childs.length; i < len; i++){
                make_ancestors(childs[i], ancestors);
            }
        }
        make_ancestors(this.root_category_temp_id, []);
    },

        /* returns a list of the category's child categories ids, or an empty list
     * if a category has no childs */
    get_category_childs_ids: function(categ_id){
        return this.category_temp_childs[categ_id] || [];
    },
    /* returns a list of all ancestors (parent, grand-parent, etc) categories ids
     * starting from the root category to the direct parent */
    get_category_ancestors_ids: function(categ_id){
        return this.category_temp_ancestors[categ_id] || [];
    },
    /* returns the parent category's id of a category, or the root_category_id if no parent.
     * the root category is parent of itself. */
    get_category_parent_id: function(categ_id){
        return this.category_temp_parent[categ_id] || this.root_category_temp_id;
    },
});

return exports;
});

