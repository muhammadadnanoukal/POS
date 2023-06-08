odoo.define('altanmia_pos_with_template.ProductScreen', function(require) {
    'use strict';
    var ProductScreen = require('point_of_sale.ProductScreen');
    const Registries = require('point_of_sale.Registries');
    const NumberBuffer = require('point_of_sale.NumberBuffer');
    var core = require('web.core');
    var _t = core._t;
    var models = require('point_of_sale.models');
    var rpc = require('web.rpc');
    const ProductItem = require('point_of_sale.ProductItem');
    var OptionalProductsModal = require('sale_product_configurator.OptionalProductsModal');

    var super_models = models.PosModel.prototype.models;

    const ProductScreenExtend = (ProductScreen) =>
        class extends ProductScreen {
            constructor() {
                super(...arguments);
                this.rootProduct=null;
                this.optionalProductsModal = null;

            }

            async _clickProduct(event) {
                const product = event.detail;
                if (!this.currentOrder) {
                    this.env.pos.add_new_order();
                }

                if (product.product_variant_ids.length ==1){
                    var prod = this.env.pos.db.get_product_by_id(parseInt(product.product_variant_id[0]));
                    const options = await this._getAddProductOptions(prod);
                    // Do not add product if options is undefined.
                    if (!options) return;
                    // Add the product after having the extra information.
                    this.currentOrder.add_product(prod, options);
                    NumberBuffer.reset();
                    return;
                }

                var self = this;
                this.rootProduct = {
                        product_id: product.product_variant_id[0],
                        quantity: 1,
                        variant_values: []
                    }
               this.optionalProductsModal = new OptionalProductsModal($('body'), {
                        rootProduct: this.rootProduct,
                        pricelistId: false,
                        okButtonText: _t('Confirm'),
                        cancelButtonText: _t('Back'),
                        title: _t('Configure'),
                    }).open();

               this.optionalProductsModal.on('options_empty', null,
                    // no optional products found for this product, only add the root product
                    this._onAddRootProductOnly.bind(self));

               this.optionalProductsModal.on('update_quantity', null,
                    this._onOptionsUpdateQuantity.bind(self));

               this.optionalProductsModal.on('confirm', null,
                    this._onModalConfirm.bind(self));

               this.optionalProductsModal.on('closed', null,
                    this._onModalClose.bind(self));

//                return optionalProductsModal.opened();
            }

            _onOptionsUpdateQuantity (quantity) {
                console.info("quantity updated");
            }

            _onModalConfirm() {
                var self = this;
                this.optionalProductsModal.getAndCreateSelectedProducts().then((products) => {
                    console.info("add products from configurator");
                    $.each(products , function(index, value) {
                        var prod = self.env.pos.db.get_product_by_id(parseInt(value.product_id));
                        self._getAddProductOptions(prod).then((options) =>{
                            if (!options) return;
                            options.quantity = value.quantity;
                                // Add the product after having the extra information.
                            self.currentOrder.add_product(prod, options);
                        });
                            // Do not add product if options is undefined.
                    });

                    NumberBuffer.reset();
                });
            }

            _onModalClose() {
                console.info("model closed");
            }

           async _onAddRootProductOnly() {
                console.info("add root product");

                var prod = this.env.pos.db.get_product_by_id(parseInt(this.rootProduct.product_id));
                this._getAddProductOptions(prod).then(options => {
                    // Do not add product if options is undefined.
                    if (!options) return;
                        // Add the product after having the extra information.
                    this.currentOrder.add_product(prod, options);
                    NumberBuffer.reset();
                });

            }
        };
    Registries.Component.extend(ProductScreen, ProductScreenExtend);
    return ProductScreen;

});