odoo.define('altanmia_pos_with_template.ProductTemplateItem', function (require) {
    'use strict';

    const ProductItem = require('point_of_sale.ProductItem');

    ProductItem.prototype.tempImageUrl = function () {
        const product = this.props.product;
        return `/web/image?model=product.template&field=image_128&id=${product.id}&write_date=${product.write_date}&unique=1`;
    };

    return ProductItem;
});