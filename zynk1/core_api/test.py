#task 1. write a function which sort an array
def sort_array(arr):
  return sorted(arr)

print(sort_array([3, 2, 1]))
assert sort_array([3, 2, 1]) == [1, 2, 3]