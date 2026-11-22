"""The 37 valley-kit pieces, modelled in game coordinates (see kitlib)."""

# First-pass colour for the stand-in box of each piece.
BOX_KEYS = {
    'barn': 'timber', 'windmill_body': 'plaster', 'windmill_sails': 'timber_lt', 'farmhouse': 'plaster',
    'hut': 'thatch', 'well': 'stone', 'fence_3m': 'timber_old', 'hedgerow_4m': 'hedge', 'haystack': 'straw',
    'sheaf': 'straw', 'beehive': 'honey', 'scarecrow': 'cloth', 'flat_stone': 'stone', 'wagon': 'timber',
    'wagon_cover': 'white', 'crate_stack': 'timber_lt', 'truce_stone': 'old_stone', 'ribbon': 'white',
    'banner_pole': 'timber', 'banner_cloth': 'white', 'pledge_board': 'timber_lt', 'lantern_wall': 'stone',
    'lantern_post': 'timber', 'paper_lantern': 'paper_glow', 'gate_bell': 'bronze', 'straw_post': 'straw',
    'studio_frame': 'timber', 'paper_screen': 'paper', 'old_standard': 'iron', 'cairn': 'stone_dk',
    'pyre_stack': 'timber_old', 'stela': 'old_stone', 'grave_stone': 'old_stone', 'barrow_mound': 'grass',
    'barrow_door': 'old_stone', 'fire_basket': 'iron_dk', 'fire_basket_flame': 'flame',
}


def build_box(B, row):
    w, d, h = row['size']
    B.box((0, 0, 0), (w, h, d), BOX_KEYS[row['id']])


BUILDERS = {}
