"""Keep the original model while removing saved workstation browsing locations."""

def clear_browser_locations(screens):
    for screen in screens:
        for area in screen.areas:
            for space in area.spaces:
                if space.type == 'FILE_BROWSER' and space.params is not None:
                    # The Shading workspace saves this directory even in background exports.
                    # Blender stores a fixed-size C array. A shorter assignment leaves
                    # the previous bytes beyond the NUL in the editable file.
                    space.params.directory = b'_' * 1089
                    space.params.directory = b'//'
