{
    'name': "POS Product Template",
    'version': '1.0.0',
    'summary': """Work With Template products instead of product variants""",
    'description': """Work With Template products instead of product variants""",
    'author': 'Mustafa Mustafa',
    'company': 'Al-Tanmya IT Solution',
    'website': "https://www.odoo.com",
    'category': 'Point of Sale',
    'depends': ['base', 'point_of_sale', 'sale_product_configurator'],
    'data': [],

    'assets': {
        'point_of_sale.assets': [
            'web/static/lib/bootstrap/css/bootstrap.css',
            'altanmia_pos_with_template/static/src/css/styles.css',
            'altanmia_pos_with_template/static/src/js/models.js',
            'altanmia_pos_with_template/static/src/js/ProductTemplateItem.js',
            'altanmia_pos_with_template/static/src/js/ProductScreen.js',
        ],
        'web.assets_qweb': [
            'altanmia_pos_with_template/static/src/xml/product_Item.xml',

        ],
    },

    'license': 'AGPL-3',
    'installable': True,
    'auto_install': False,
}
